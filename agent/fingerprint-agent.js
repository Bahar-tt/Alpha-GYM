/**
 * Alpha Gym - Fingerprint / Card Scanner Agent (FOH02 / RFT-200-Mifer)
 * نسخه koffi — بدون ffi-napi / node-gyp
 * پیش‌فرض سرور: پورت 3001
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  SERVER_HOST: process.env.AGENT_HOST || process.env.SERVER_HOST || '127.0.0.1',
  SERVER_PORT: Number(process.env.AGENT_PORT || process.env.SERVER_PORT || 3001),
  API_PATH: process.env.API_PATH || '/attendance/scan',

  COM_PORT: process.env.COM_PORT || 'COM5',
  BAUD: Number(process.env.COM_BAUD) || 9600,
  DEVICE_ADDR: 0,

  DLL_DIR: path.join(__dirname, 'dll'),
  EASY_DLL: path.join(__dirname, 'dll', 'EasyD12.dll'),
  MF_API_DLL: path.join(__dirname, 'dll', 'MF_API.dll'),

  SYNC_INTERVAL: 2000,
  POLL_INTERVAL: 1000,
  DEBOUNCE_MS: 4000,
  LOCAL_CACHE: path.join(__dirname, 'attendance_cache.json'),
  LOG_FILE: path.join(__dirname, 'agent.log'),
};

function log(msg) {
  const ts = new Date().toLocaleString('fa-IR');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(CONFIG.LOG_FILE, line + '\n');
  } catch (_) {}
}

let pendingScans = [];

function loadCache() {
  try {
    if (fs.existsSync(CONFIG.LOCAL_CACHE)) {
      pendingScans = JSON.parse(fs.readFileSync(CONFIG.LOCAL_CACHE, 'utf8'));
      if (!Array.isArray(pendingScans)) pendingScans = [];
      log(`کش بارگذاری شد: ${pendingScans.length} اسکن معلق`);
    }
  } catch (e) {
    log(`خطای کش: ${e.message}`);
    pendingScans = [];
  }
}

function saveCache() {
  try {
    fs.writeFileSync(CONFIG.LOCAL_CACHE, JSON.stringify(pendingScans, null, 2));
  } catch (_) {}
}

function sendToServer(scanData) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(scanData);
    const req = http.request(
      {
        hostname: CONFIG.SERVER_HOST,
        port: CONFIG.SERVER_PORT,
        path: CONFIG.API_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 8000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve({ ok: true, raw: body });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(data);
    req.end();
  });
}

let fohLib = null;
let deviceReady = false;
let lastUID = null;
let lastScanTime = 0;

function loadDLL() {
  try {
    const koffi = require('koffi');

    const candidates = [CONFIG.MF_API_DLL, CONFIG.EASY_DLL];
    let dllPath = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        dllPath = p;
        break;
      }
    }
    if (!dllPath) {
      log('هیچ DLL یافت نشد در پوشه dll/');
      return false;
    }

    log(`بارگذاری DLL با koffi: ${dllPath}`);
    const lib = koffi.load(dllPath);

    fohLib = {
      MF_InitComm: lib.func('int MF_InitComm(str port, long baud)'),
      MF_ExitComm: lib.func('int MF_ExitComm()'),
      MF_SetRecvTimeout: lib.func('int MF_SetRecvTimeout(uint32 timeout)'),
      MF_Request: lib.func('int MF_Request(int addr, uint8 mode, void *cardType)'),
      MF_Anticoll: lib.func('int MF_Anticoll(int addr, void *snr)'),
      MF_Select: lib.func('int MF_Select(int addr, void *snr)'),
      MF_Halt: lib.func('int MF_Halt(int addr)'),
      MF_ControlBuzzer: lib.func('int MF_ControlBuzzer(int addr, uint8 time)'),
      MF_ControlLED: lib.func('int MF_ControlLED(int addr, uint8 led, uint8 time)'),
    };

    log('DLL با موفقیت بارگذاری شد ✓ (koffi)');
    return true;
  } catch (e) {
    log(`بارگذاری DLL ناموفق: ${e.message}`);
    log('برای سخت‌افزار: npm install koffi');
    return false;
  }
}

function initDevice() {
  if (!fohLib) return false;
  try {
    log(`اتصال به ${CONFIG.COM_PORT} @ ${CONFIG.BAUD}...`);
    const r = fohLib.MF_InitComm(CONFIG.COM_PORT, CONFIG.BAUD);
    if (r === 0) {
      deviceReady = true;
      try {
        fohLib.MF_SetRecvTimeout(500);
      } catch (_) {}
      log('دستگاه آماده ✓');
      return true;
    }
    log(`MF_InitComm ناموفق (کد: ${r}) — پورت یا درایور را چک کنید`);
    return false;
  } catch (e) {
    log(`خطای اتصال: ${e.message}`);
    return false;
  }
}

function pollDevice() {
  if (!fohLib || !deviceReady) return;
  try {
    const cardType = Buffer.alloc(2);
    const r1 = fohLib.MF_Request(CONFIG.DEVICE_ADDR, 0, cardType);
    if (r1 !== 0) return;

    const snr = Buffer.alloc(16);
    const r2 = fohLib.MF_Anticoll(CONFIG.DEVICE_ADDR, snr);
    if (r2 !== 0) return;

    const uid = snr.slice(0, 4).toString('hex').toUpperCase();
    if (!uid || /^0+$/.test(uid)) return;

    const now = Date.now();
    if (uid === lastUID && now - lastScanTime < CONFIG.DEBOUNCE_MS) return;

    lastUID = uid;
    lastScanTime = now;

    pendingScans.push({
      member_code: uid,
      personnel_code: uid,
      scan_type: 'check_in',
      device_id: `USB-${CONFIG.COM_PORT}`,
      scan_time: new Date().toISOString(),
      source: 'scanner',
    });
    saveCache();

    try {
      fohLib.MF_ControlBuzzer(CONFIG.DEVICE_ADDR, 1);
    } catch (_) {}

    log(`✓ اسکن: ${uid}`);
  } catch (_) {}
}

async function sync() {
  if (pendingScans.length === 0) return;

  log(
    `ارسال ${pendingScans.length} اسکن به ${CONFIG.SERVER_HOST}:${CONFIG.SERVER_PORT}${CONFIG.API_PATH} ...`
  );

  const failed = [];
  for (const scan of pendingScans) {
    try {
      const result = await sendToServer(scan);
      const name = result.member?.name || result.message || 'موفق';
      log(`  ✓ ${scan.member_code} → ${name}`);
    } catch (e) {
      log(`  ✗ ${scan.member_code} — ${e.message}`);
      failed.push(scan);
    }
  }
  pendingScans = failed;
  saveCache();
}

function maybeTestPing() {
  const arg = process.argv.find((a) => a.startsWith('--test-code='));
  if (!arg) return;
  const code = arg.split('=')[1];
  pendingScans.push({
    member_code: code,
    personnel_code: code,
    scan_type: 'check_in',
    device_id: 'TEST',
    scan_time: new Date().toISOString(),
    source: 'scanner-test',
  });
  log(`حالت تست: کد ${code} به صف اضافه شد`);
}

log('═══════════════════════════════════════');
log('  Alpha Gym - Fingerprint Agent (koffi)');
log('  دستگاه: RFT-200-Mifer (FOH02)');
log(`  پورت: ${CONFIG.COM_PORT} @ ${CONFIG.BAUD}`);
log(`  سرور: http://${CONFIG.SERVER_HOST}:${CONFIG.SERVER_PORT}${CONFIG.API_PATH}`);
log('═══════════════════════════════════════');

loadCache();
maybeTestPing();

if (loadDLL()) {
  initDevice();
} else {
  log('');
  log('⚠️ حالت نرم‌افزاری — سخت‌افزار غیرفعال');
  log('   npm install koffi');
  log('   node fingerprint-agent.js --test-code=16');
  log('');
}

setInterval(pollDevice, CONFIG.POLL_INTERVAL);
setInterval(sync, CONFIG.SYNC_INTERVAL);
setInterval(saveCache, 30000);

setTimeout(() => {
  sync().catch(() => {});
}, 500);

process.on('SIGINT', () => {
  log('در حال خروج...');
  saveCache();
  if (fohLib) {
    try {
      fohLib.MF_ExitComm();
    } catch (_) {}
  }
  process.exit(0);
});
