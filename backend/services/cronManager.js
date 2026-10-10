const cron = require('node-cron');
const Database = require('better-sqlite3');
const path = require('path');
const { todayJalali } = require('../utils/date');
const { sendBirthday, sendExpiryWarning } = require('./smsService');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../gym.db');
const db = new Database(DB_PATH);
let started = false;

const SMS_SEND_DELAY_MS = Number(process.env.SMS_SEND_DELAY_MS) || 400;

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* =========================
   BIRTHDAY CRON — هر روز تولد پیامک خودکار
========================= */
async function checkBirthdays() {
  const today = todayJalali();
  const partsToday = today.split('/');
  if (partsToday.length !== 3) return;
  const month = partsToday[1];
  const day = partsToday[2];

  const members = db.prepare(`
    SELECT * FROM members
    WHERE birthday IS NOT NULL AND TRIM(birthday) != ''
  `).all();

  const birthdayMembers = members.filter((m) => {
    const parts = String(m.birthday).split(/[/-]/);
    if (parts.length !== 3) return false;
    // پشتیبانی از YYYY/MM/DD یا YYYY-MM-DD شمسی
    const bm = String(Number(parts[1])).padStart(2, '0');
    const bd = String(Number(parts[2])).padStart(2, '0');
    const tm = String(Number(month)).padStart(2, '0');
    const td = String(Number(day)).padStart(2, '0');
    return bm === tm && bd === td;
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

  console.log(`[Birthday Cron SUMMARY] total=${birthdayMembers.length} success=${successCount} failed=${failureCount}`);
}

/* =========================
   EXPIRY REMINDER — دقیقاً ۳ روز قبل از پایان، پیامک خودکار
========================= */
async function checkExpiryReminders() {
  const today = new Date();
  const d = new Date();
  d.setDate(today.getDate() + 3);
  const targetDate = d.toISOString().split('T')[0];

  const members = db.prepare(`
    SELECT * FROM members
    WHERE expiry_date = ?
  `).all(targetDate);

  if (members.length === 0) {
    console.log('[Expiry Cron] No members expiring in 3 days');
    return;
  }

  console.log(`[Expiry Cron] Found ${members.length} member(s) expiring in 3 days`);

  let successCount = 0;
  let failureCount = 0;

  for (const member of members) {
    try {
      const ok = await sendExpiryWarning(member, 3);
      if (ok) successCount++; else failureCount++;
    } catch (err) {
      failureCount++;
      console.error(`[Expiry Cron] Error sending to ${member.name} (${member.phone})`, err);
    }
    await delay(SMS_SEND_DELAY_MS);
  }

  console.log(`[Expiry Cron SUMMARY] total=${members.length} success=${successCount} failed=${failureCount}`);
}

function startCrons() {
  if (started) return;
  started = true;
  console.log('[CRON] Starting production cron system...');

  // تولد — هر روز ۹ صبح تهران
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Birthday check running...');
    await checkBirthdays();
  }, { timezone: 'Asia/Tehran' });

  // ۳ روز قبل انقضا — هر روز ۱۰ صبح تهران
  cron.schedule('0 10 * * *', async () => {
    console.log('[CRON] Expiry reminder (3 days) running...');
    await checkExpiryReminders();
  }, { timezone: 'Asia/Tehran' });

  console.log('[CRON] All jobs active (birthday + 3-day expiry SMS)');
}

module.exports = {
  startCrons,
};
