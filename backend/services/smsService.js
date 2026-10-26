require('dotenv').config();
const Database = require('better-sqlite3');
const path     = require('path');
const https    = require('https');
const dns      = require('dns');
const { toJalali } = require('../utils/date');

const db = new Database(path.join(__dirname, '../gym.db'));

/* =========================
   KAVENEGAR CONFIG
========================= */
const KAVENEGAR_API_KEY = process.env.KAVENEGAR_API_KEY;
const KAVENEGAR_SENDER = process.env.KAVENEGAR_SENDER || '20006000853';
const KAVENEGAR_HOST = 'api.kavenegar.com';

if (!KAVENEGAR_API_KEY) {
  console.error('[FATAL] KAVENEGAR_API_KEY تنظیم نشده! فایل .env را بررسی کنید.');
}


const kavenegarResolver = new dns.Resolver();
kavenegarResolver.setServers(['8.8.8.8', '1.1.1.1']);

let cachedIp = null;
let cachedIpAt = 0;
const IP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 دقیقه کش IP، برای کاهش تعداد کوئری‌های DNS

function resolveKavenegarIp() {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    if (cachedIp && (now - cachedIpAt) < IP_CACHE_TTL_MS) {
      return resolve(cachedIp);
    }
    kavenegarResolver.resolve4(KAVENEGAR_HOST, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        return reject(err || new Error('No DNS result'));
      }
      cachedIp = addresses[0];
      cachedIpAt = now;
      resolve(cachedIp);
    });
  });
}

/* =========================
   KAVENEGAR API CALL
========================= */
async function kavenegarSend(receptor, message) {
  let ip;
  try {
    ip = await resolveKavenegarIp();
  } catch (err) {
    return { ok: false, error: `DNS resolve failed: ${err.message}` };
  }

  return new Promise((resolve) => {
    const params = new URLSearchParams({
      receptor,
      sender:  KAVENEGAR_SENDER,
      message,
    }).toString();

    const options = {
      host: ip,                     // ✅ اتصال مستقیم به IP resolve شده
      servername: KAVENEGAR_HOST,   // ✅ لازم برای SNI صحیح در TLS
      path:     `/v1/${KAVENEGAR_API_KEY}/sms/send.json`,
      method:   'POST',
      headers: {
        'Host':           KAVENEGAR_HOST, // ✅ لازم چون از IP وصل می‌شویم نه دامنه
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params),
        'Accept':         'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json?.return?.status === 200) {
            // ✅ جزئیات واقعی وضعیت تحویل کاوه‌نگار رو هم برمی‌گردونیم تا لاگ بشه
            const entry = json?.entries?.[0];
            resolve({
              ok: true,
              messageid: entry?.messageid || null,
              statustext: entry?.statustext || null,
            });
          } else {
            resolve({ ok: false, error: json?.return?.message || 'Unknown error' });
          }
        } catch {
          resolve({ ok: false, error: 'Parse error' });
        }
      });
    });

    req.on('error', (err) => {
      cachedIp = null; // ✅ اگر IP کش‌شده دیگر جواب نداد، دفعه‌ی بعد دوباره resolve کن
      resolve({ ok: false, error: err.message });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
    req.write(params);
    req.end();
  });
}

/*
========================= */
async function sendSMS({ member_id, name, phone, message, type = 'general' }) {
  // ⚠️ توجه: پارامتر status دیگر از بیرون پذیرفته نمی‌شود.
  // status همیشه از روی نتیجه‌ی واقعی ارسال به کاوه‌نگار محاسبه می‌شود
  // (قبلاً هر جا 'mock' هاردکد شده بود، وضعیت واقعی ارسال را نادیده می‌گرفت).
  try {
    // چک تکراری
    if (member_id && type !== 'general' && hasSentToday(member_id, type)) {
      console.log(`[SKIP DUPLICATE SMS] ${type} -> ${name}`);
      return false;
    }

    // ارسال واقعی از طریق کاوه‌نگار
    const result = await kavenegarSend(phone, message);
    const status = result.ok ? 'sent' : 'failed';

    if (!result.ok) {
      console.error(`[SMS FAILED - ${type}] -> ${phone} | ${result.error}`);
    } else {
      // ✅ لاگ جزئیات واقعی وضعیت تحویل (نه فقط اینکه درخواست پذیرفته شده)
      console.log(`[SMS SENT - ${type}] -> ${phone} | messageid=${result.messageid} | statustext=${result.statustext}`);
    }

    // ✅ FIX: قبلاً created_at از DEFAULT جدول (datetime('now')) پر می‌شد که
    // زمان UTC است، نه وقت تهران. چون رشته‌ی ذخیره‌شده فرمت ISO استاندارد
    // (بدون T و Z) نداشت، فرانت‌اند هم آن را بدون تبدیل نمایش می‌داد و نتیجه
    // ۳ ساعت و ۳۰ دقیقه عقب‌تر از ساعت واقعی نشان داده می‌شد. اینجا مستقیماً
    // وقت تهران را در همان لحظه‌ی ثبت محاسبه و ذخیره می‌کنیم.
    db.prepare(`
      INSERT INTO sms_logs (member_id, name, phone, message, type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+3.5 hours'))
    `).run(member_id || null, name || null, phone, message, type, status);

    return result.ok;

  } catch (err) {
    console.error('[SMS ERROR]', err);
    return false;
  }
}

/* =========================
   TEMPLATES
========================= */

function sendWelcome(member) {
  const message = `سلام ${member.name} عزیز 🌿

به خانواده باشگاه آلفا خوش آمدی 💪

اینجا فقط تمرین نیست…
اینجا ساختن نسخه قوی‌تر خودته.

📅 پایان عضویت:
${toJalali(member.expiry_date)}

ما کنار تو هستیم تا آخر مسیر 🔥`.trim();

  return sendSMS({ member_id: member.id, name: member.name, phone: member.phone, message, type: 'Welcome' });
}

function sendRenewal(member, newDate) {
  const message = `سلام ${member.name} عزیز 🌿

تمدیدت با موفقیت ثبت شد 👏

تو فقط عضویتت رو تمدید نکردی…
تو مسیر رشدتو ادامه دادی.

📅 تاریخ جدید پایان:
${toJalali(newDate)}

قدرت تو ادامه داره 💪`.trim();

  return sendSMS({ member_id: member.id, name: member.name, phone: member.phone, message, type: 'SendRenewal' });
}

function sendExpiryWarning(member, daysLeft) {
  const message = `سلام ${member.name} عزیز 🌿

عضویت تو فقط ${daysLeft} روز دیگه تموم میشه.

این لحظه، لحظه تصمیمه...
ادامه دادن مسیر قدرت 💪 یا توقف؟

باشگاه آلفا منتظر ادامه مسیر رشد توئه.

📌 تاریخ پایان: ${toJalali(member.expiry_date)}

🔥 الان بهترین زمان تمدیده`.trim();

  return sendSMS({ member_id: member.id, name: member.name, phone: member.phone, message, type: 'Expiry' });
}

function sendBirthday(member) {
  const message = `🎉 تولدت مبارک ${member.name} عزیز

امروز فقط یک روز نیست…
یادآور شروع یک مسیر بزرگه.

باشگاه آلفا برات آرزو می‌کنه:
انرژی 💪
سلامتی 🌿
و استمرار بی‌وقفه 🔥

امروز روز توئه 🌟`.trim();

  return sendSMS({ member_id: member.id, name: member.name, phone: member.phone, message, type: 'birthday' });
}

async function sendAnnouncement(members, text) {
  // ✅ FIX: قبلاً با forEach بدون await صدا زده می‌شد که باعث ارسال همزمان
  // (concurrent) و برخورد با rate-limit کاوه‌نگار می‌شد.
  const message = `📢 اطلاعیه باشگاه آلفا

${text}

این فقط اطلاعیه نیست…
این بخشی از مسیر مشترک ماست 💪`.trim();

  let successCount = 0;
  let failureCount = 0;

  for (const m of members) {
    const ok = await sendSMS({ member_id: m.id, name: m.name, phone: m.phone, message, type: 'general' });
    if (ok) successCount++; else failureCount++;
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.SMS_SEND_DELAY_MS) || 400));
  }

  console.log(`[Announcement SUMMARY] total=${members.length} success=${successCount} failed=${failureCount}`);
  return { successCount, failureCount };
}

/* =========================
   Anti-Duplicate Checker
========================= */
function hasSentToday(member_id, type) {
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare(`
    SELECT id FROM sms_logs
    WHERE member_id = ? AND type = ? AND date(created_at) = ?
    LIMIT 1
  `).get(member_id, type, today);
  return !!row;
}

/* =========================
   EXPORTS
========================= */
module.exports = { sendSMS, sendWelcome, sendRenewal, sendExpiryWarning, sendBirthday, sendAnnouncement };
