const cron = require('node-cron');
const Database = require('better-sqlite3');
const path = require('path');
const { todayJalali } = require('../utils/date');
const { sendBirthday, sendExpiryWarning } = require('./smsService');
const DB_PATH = path.join(__dirname, '../gym.db');
const db = new Database(DB_PATH);
let started = false;

// فاصله بین هر ارسال پیامک در کرون‌ها (میلی‌ثانیه) - قابل تنظیم از .env
const SMS_SEND_DELAY_MS = Number(process.env.SMS_SEND_DELAY_MS) || 400;

/* =========================
   HELPERS
========================= */
function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* =========================
   BIRTHDAY CRON
========================= */
// ✅ FIX: قبلاً forEach بدون await روی sendBirthday صدا زده می‌شد، یعنی همه‌ی
// پیامک‌های تولد همزمان (concurrent) ارسال می‌شدند و باعث rate-limit/timeout
// سمت کاوه‌نگار می‌شدند. حالا با for...of + await + delay ارسال به ترتیب انجام می‌شه.
async function checkBirthdays() {
  const today = todayJalali();
  const [, month, day] = today.split('/');

  const members = db.prepare(`
    SELECT * FROM members
    WHERE birthday IS NOT NULL
  `).all();

  const birthdayMembers = members.filter((m) => {
    const parts = String(m.birthday).split('/');
    if (parts.length !== 3) return false;
    return parts[1] === month && parts[2] === day;
  });

  if (birthdayMembers.length === 0) {
    console.log('[Birthday Cron] No birthdays today');
    return;
  }

  console.log(`[Birthday Cron] Found ${birthdayMembers.length} member(s)`);

  let successCount = 0;
  let failureCount = 0;

  for (const member of birthdayMembers) {
    try {
      const ok = await sendBirthday(member);
      if (ok) successCount++; else failureCount++;
    } catch (err) {
      failureCount++;
      console.error(`[Birthday Cron] Error sending to ${member.name} (${member.phone})`, err);
    }
    await delay(SMS_SEND_DELAY_MS);
  }

  // ✅ لاگ خلاصه
  console.log(`[Birthday Cron SUMMARY] total=${birthdayMembers.length} success=${successCount} failed=${failureCount}`);
}

/* =========================
   EXPIRY REMINDER CRON
========================= */
// ✅ FIX: همون مشکل forEach بدون await اینجا هم بود.
async function checkExpiryReminders() {
  const today = new Date();
  const targetDates = [1, 3, 7].map((days) => {
    const d = new Date();
    d.setDate(today.getDate() + days);
    return d.toISOString().split('T')[0];
  });

  const placeholders = targetDates.map(() => '?').join(',');
  const members = db.prepare(`
    SELECT * FROM members
    WHERE expiry_date IN (${placeholders})
  `).all(...targetDates);

  if (members.length === 0) {
    console.log('[Expiry Cron] No expiring members soon');
    return;
  }

  console.log(`[Expiry Cron] Found ${members.length} member(s)`);

  let successCount = 0;
  let failureCount = 0;

  for (const member of members) {
    const todayDate = new Date();
    const diff = Math.ceil(
      (new Date(member.expiry_date) - todayDate) / (1000 * 60 * 60 * 24)
    );
    try {
      const ok = await sendExpiryWarning(member, diff);
      if (ok) successCount++; else failureCount++;
    } catch (err) {
      failureCount++;
      console.error(`[Expiry Cron] Error sending to ${member.name} (${member.phone})`, err);
    }
    await delay(SMS_SEND_DELAY_MS);
  }

  // ✅ لاگ خلاصه
  console.log(`[Expiry Cron SUMMARY] total=${members.length} success=${successCount} failed=${failureCount}`);
}

/* =========================
   START CRONS
========================= */
function startCrons() {
  if (started) return;
  started = true;
  console.log('[CRON] Starting production cron system...');

  // 🟡 Birthday check - every day 09:00
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Birthday check running...');
    await checkBirthdays();
  }, {
    timezone: 'Asia/Tehran',
  });

  // 🟡 Expiry reminder - every day 10:00
  cron.schedule('0 10 * * *', async () => {
    console.log('[CRON] Expiry reminder running...');
    await checkExpiryReminders();
  }, {
    timezone: 'Asia/Tehran',
  });

  console.log('[CRON] All jobs active');
}

module.exports = {
  startCrons,
};
