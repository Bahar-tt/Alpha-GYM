const cron = require('node-cron');
const Database = require('better-sqlite3');
const path = require('path');
const { todayJalali } = require('../utils/date');
const { sendBirthday, sendExpiryWarning } = require('./smsService');

const DB_PATH = path.join(__dirname, '../gym.db');
const db = new Database(DB_PATH);

let started = false;

/* =========================
   HELPERS
========================= */

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

/* =========================
   BIRTHDAY CRON
========================= */

function checkBirthdays() {
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

  birthdayMembers.forEach((member) => {
    sendBirthday(member);
  });
}

/* =========================
   EXPIRY REMINDER CRON
========================= */

function checkExpiryReminders() {
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

  members.forEach((member) => {
    const todayDate = new Date();
    const diff = Math.ceil(
      (new Date(member.expiry_date) - todayDate) / (1000 * 60 * 60 * 24)
    );

    sendExpiryWarning(member, diff);
  });
}

/* =========================
   START CRONS
========================= */

function startCrons() {
  if (started) return;
  started = true;

  console.log('[CRON] Starting production cron system...');

  // 🟡 Birthday check - every day 09:00
  cron.schedule('0 9 * * *', () => {
    console.log('[CRON] Birthday check running...');
    checkBirthdays();
  }, {
    timezone: 'Asia/Tehran',
  });

  // 🟡 Expiry reminder - every day 10:00
  cron.schedule('0 10 * * *', () => {
    console.log('[CRON] Expiry reminder running...');
    checkExpiryReminders();
  }, {
    timezone: 'Asia/Tehran',
  });

  console.log('[CRON] All jobs active');
}

module.exports = {
  startCrons,
};