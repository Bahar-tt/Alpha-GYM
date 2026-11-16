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

// ثبت هشدارهای مالی برای پنل مدیریت.
function refreshFinancialAlerts() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS member_financial_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, alert_type TEXT NOT NULL,
      due_date TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open',
      message TEXT, last_notified_at TEXT, created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(member_id, alert_type, due_date)
    )`);
    const today = todayIso();
    const until = db.prepare("SELECT date(?, '+7 day') AS d").get(today).d;
    const memberColumns = db.prepare('PRAGMA table_info(members)').all().map((c) => c.name);
    const feeExpr = memberColumns.includes('monthly_fee')
      ? 'COALESCE(NULLIF(monthly_fee, 0), (SELECT SUM(COALESCE(ms.tuition_amount, ms.unit_price, 0)) FROM member_sports ms WHERE ms.member_id=members.id), 0)'
      : '(SELECT COALESCE(SUM(COALESCE(ms.tuition_amount, ms.unit_price, 0)), 0) FROM member_sports ms WHERE ms.member_id=members.id)';
    const rows = db.prepare(`SELECT id, name, expiry_date,
      ${feeExpr} AS amount
      FROM members WHERE expiry_date IS NOT NULL AND date(expiry_date) <= date(?)`).all(until);
    const upsert = db.prepare(`INSERT INTO member_financial_alerts (member_id, alert_type, due_date, amount, message)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(member_id, alert_type, due_date) DO UPDATE SET amount=excluded.amount, message=excluded.message, status='open'`);
    db.transaction(() => rows.forEach((m) => {
      const type = String(m.expiry_date) < today ? 'overdue' : 'due_soon';
      upsert.run(m.id, type, String(m.expiry_date).slice(0, 10), Number(m.amount) || 0, type === 'overdue' ? `بدهی/تمدید عقب‌افتاده عضو ${m.name}` : `سررسید شهریه عضو ${m.name} نزدیک است`);
    }))();
    console.log(`[Financial Alerts] refreshed=${rows.length}`);
  } catch (err) {
    console.error('[Financial Alerts] refresh failed:', err.message);
  }
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

  // هشدار بدهی و سررسید شهریه — هر روز ۸:۳۰ صبح تهران
  cron.schedule('30 8 * * *', refreshFinancialAlerts, { timezone: 'Asia/Tehran' });

  console.log('[CRON] All jobs active (birthday + expiry SMS + financial alerts)');
}

module.exports = {
  startCrons,
};
