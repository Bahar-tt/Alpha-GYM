/**
 * Alpha Gym - Fingerprint Scanner Agent (FOH02 / RFT-200-Mifer)
 * 
 * اتصال: USB (COM5) از طریق DLL
 * ارسال داده به سرور VPS
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// تنظیمات
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
  SERVER_HOST: '78.157.51.176',
  SERVER_PORT: 80,
  API_PATH: '/api/attendance/scan',
  
  // USB - COM5 از Device Manager
  COM_PORT: 'COM5',
  BAUD: 9600,
  
  // DLL
  DLL_DIR: path.join(__dirname, 'dll'),
  EASY_DLL: path.join(__dirname, 'dll', 'EasyD12.dll'),
  MF_API_DLL: path.join(__dirname, 'dll', 'MF_API.dll'),
  
  SYNC_INTERVAL: 2000,
  LOCAL_CACHE: path.join(__dirname, 'attendance_cache.json'),
  LOG_FILE: path.join(__dirname, 'agent.log'),
};

// ═══════════════════════════════════════════════════════════════
// لاگ
// ═══════════════════════════════════════════════════════════════
function log(msg) {
  const ts = new Date().toLocaleString('fa-IR');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(CONFIG.LOG_FILE, line + '\n'); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════
// کش محلی
// ═══════════════════════════════════════════════════════════════
let pendingScans = [];

function loadCache() {
  try {
    if (fs.existsSync(CONFIG.LOCAL_CACHE)) {
      pendingScans = JSON.parse(fs.readFileSync(CONFIG.LOCAL_CACHE, 'utf8'));
      log(`کش بارگذاری شد: ${pendingScans.length} اسکن معلق`);
    }
  } catch (e) { log(`خطای کش: ${e.message}`); }
}

function saveCache() {
  try { fs.writeFileSync(CONFIG.LOCAL_CACHE, JSON.stringify(pendingScans)); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════
// ارسال به سرور
// ═══════════════════════════════════════════════════════════════
function sendToServer(scanData) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(scanData);
    const req = http.request({
      hostname: CONFIG.SERVER_HOST,
      port: CONFIG.SERVER_PORT,
      path: CONFIG.API_PATH,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 8000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); } catch { resolve({ ok: true }); }
        } else { reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// DLL FFI (اگر نصب باشد)
// ═══════════════════════════════════════════════════════════════
let fohLib = null;
let ffi = null;
let ref = null;

function loadDLL() {
  try {
    ffi = require('ffi-napi');
    ref = require('ref-napi');
    
    const dllPath = CONFIG.EASY_DLL;
    log(`بارگذاری DLL: ${dllPath}`);
    
    // توابع واقعی از MF_API.h
    fohLib = ffi.Library(dllPath, {
      // مدیریت ارتباط
      'MF_InitComm':     ['int', ['string', 'long']],
      'MF_ExitComm':     ['int', []],
      'MF_SetRecvTimeout': ['int', ['uint']],
      'MF_GetDLL_Ver':   ['int', ['pointer']],
      
      // اطلاعات دستگاه
      'MF_GetDevice_Ver': ['int', ['int', 'pointer']],
      'MF_GetDeviceAddr': ['int', ['int', 'pointer']],
      'MF_GetDeviceSNR':  ['int', ['int', 'pointer']],
      'MF_DeviceReset':   ['int', ['int']],
      
      // خواندن کارت/اثر انگشت
      'MF_Request':       ['int', ['int', 'uchar', 'pointer']],
      'MF_Anticoll':      ['int', ['int', 'pointer']],
      'MF_Select':        ['int', ['int', 'pointer']],
      'MF_Halt':          ['int', ['int']],
      'MF_GeneralCMD':    ['int', ['int', 'pointer', 'uchar', 'pointer', 'pointer']],
      
      // کنترل خروجی
      'MF_ControlBuzzer': ['int', ['int', 'uchar']],
      'MF_ControlLED':    ['int', ['int', 'uchar', 'uchar']],
    });
    
    log('DLL با موفقیت بارگذاری شد ✓');
    return true;
  } catch (e) {
    log(`بارگذاری DLL ناموفق: ${e.message}`);
    log('نصب FFI لازم است: npm install ffi-napi ref-napi');
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// پولینگ دستگاه
// ═══════════════════════════════════════════════════════════════
let deviceReady = false;
let lastUID = null;
let lastScanTime = 0;

function initDevice() {
  if (!fohLib) return false;
  
  try {
    const result = fohLib.MF_InitComm(ref.types.CString, CONFIG.COM_PORT, CONFIG.BAUD);
    // یا با روش ساده‌تر
    log(`اتصال به ${CONFIG.COM_PORT}...`);
    
    // استفاده از MF_GeneralCMD برای تست اتصال
    const testCmd = Buffer.from([0x00, 0x01]); // دستور خواندن نسخه
    const cmdBuf = ref.alloc('buffer', testCmd);
    const rspBuf = ref.alloc('buffer', 256);
    const rspLen = ref.alloc('uchar');
    
    const r = fohLib.MF_GeneralCMD(0, cmdBuf, testCmd.length, rspBuf, rspLen);
    
    if (r === 0) {
      deviceReady = true;
      log('دستگاه آماده ✓');
      return true;
    } else {
      log(`دستگاه پاسخ نداد (کد: ${r})`);
      return false;
    }
  } catch (e) {
    log(`خطای اتصال: ${e.message}`);
    return false;
  }
}

function pollDevice() {
  if (!fohLib || !deviceReady) return;
  
  try {
    // خواندن شناسه کارت/اثر انگشت
    const cardType = ref.alloc('uchar', 2);
    const r1 = fohLib.MF_Request(0, 0, cardType);
    
    if (r1 === 0) {
      const snr = ref.alloc('buffer', 16);
      const r2 = fohLib.MF_Anticoll(0, snr);
      
      if (r2 === 0) {
        const snrData = Buffer.from(snr.buffer, snr.byteOffset, 4);
        const uid = snrData.toString('hex').toUpperCase();
        
        if (uid && uid !== lastUID) {
          lastUID = uid;
          lastScanTime = Date.now();
          
          pendingScans.push({
            member_code: uid,
            member_name: '',
            scan_type: 'check_in',
            device_id: 'USB-COM5',
            scan_time: new Date().toISOString(),
          });
          
          log(`✓ اسکن: ${uid}`);
        }
      }
    }
  } catch (e) {
    // خطای عادی - دستگاه منتظر کارت نیست
  }
}

// ═══════════════════════════════════════════════════════════════
// همگام‌سازی
// ═══════════════════════════════════════════════════════════════
async function sync() {
  if (pendingScans.length === 0) return;
  
  log(`ارسال ${pendingScans.length} اسکن به سرور...`);
  
  const failed = [];
  for (const scan of pendingScans) {
    try {
      const result = await sendToServer(scan);
      log(`  ✓ ارسال شد: ${scan.member_code} - ${result.message || 'موفق'}`);
    } catch (e) {
      log(`  ✗ خطا: ${scan.member_code} - ${e.message}`);
      failed.push(scan);
    }
  }
  
  pendingScans = failed;
  saveCache();
}

// ═══════════════════════════════════════════════════════════════
// اجرا
// ═══════════════════════════════════════════════════════════════
log('═══════════════════════════════════════');
log('  Alpha Gym - Fingerprint Agent');
log('  دستگاه: RFT-200-Mifer (FOH02)');
log(`  پورت: ${CONFIG.COM_PORT} @ ${CONFIG.BAUD} baud`);
log(`  سرور: ${CONFIG.SERVER_HOST}`);
log('═══════════════════════════════════════');

loadCache();

// بررسی DLL
if (loadDLL()) {
  initDevice();
} else {
  log('');
  log('⚠️ حالت بدون DLL - فقط همگام‌سازی کار می‌کند');
  log('برای فعال‌سازی کامل:');
  log('  npm install ffi-napi ref-napi');
  log('');
}

// پولینگ دستگاه هر ۱ ثانیه
setInterval(pollDevice, 1000);

// همگام‌سازی هر ۲ ثانیه
setInterval(sync, CONFIG.SYNC_INTERVAL);

// ذخیره دوره‌ای
setInterval(saveCache, 30000);

// خروج
process.on('SIGINT', () => {
  log('در حال خروج...');
  saveCache();
  if (fohLib) try { fohLib.MF_ExitComm(); } catch (e) {}
  process.exit(0);
});