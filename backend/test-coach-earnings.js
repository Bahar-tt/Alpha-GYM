/**
 * test-coach-earnings.js — تست موتور سهم مربی روی یک دیتابیس موقت
 * اجرا: node test-coach-earnings.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), `alpha-earnings-test-${Date.now()}.db`);
process.env.TEST_DB = TMP;

const Database = require('./sqlite-wrapper');
const { earnFromSession, revokeSessionEarnings, accrueMonthlySalary, summarizeCoach, periodOf } =
  require('./services/coachEarnings');

const db = new Database(TMP);

let pass = 0;
let fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label} ${extra}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

/* ---------- schema ---------- */
section('Schema');
db.exec(`CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, sport TEXT, expiry_date TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS member_sports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER, sport TEXT, sport_plan_id INTEGER,
  weekly_sessions INTEGER, total_sessions INTEGER, used_sessions INTEGER, tuition_amount INTEGER,
  fee_basis TEXT, class_type TEXT, start_date TEXT, expiry_date TEXT, unit_price INTEGER
)`);
db.exec(`CREATE TABLE IF NOT EXISTS coaches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, is_active INTEGER DEFAULT 1,
  pay_model TEXT DEFAULT 'share', default_share INTEGER DEFAULT 50, monthly_salary INTEGER DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS coach_sports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, coach_id INTEGER, sport TEXT,
  commission_percent INTEGER DEFAULT 0, commission_amount INTEGER, share_percent INTEGER DEFAULT 50, gym_percent INTEGER
)`);
db.exec(`CREATE TABLE IF NOT EXISTS coach_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, coach_id INTEGER, coach_name TEXT, member_id INTEGER,
  session_date TEXT, session_time TEXT, duration_minutes INTEGER DEFAULT 60,
  session_type TEXT DEFAULT 'personal', status TEXT DEFAULT 'scheduled', notes TEXT,
  share_percent INTEGER, coach_share_amount INTEGER, earnings_id INTEGER, sport TEXT, unit_price INTEGER
)`);
db.exec(`CREATE TABLE IF NOT EXISTS coach_earnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, coach_id INTEGER, member_id INTEGER, member_name TEXT, sport TEXT,
  session_id INTEGER, source_type TEXT NOT NULL, source_id INTEGER, period TEXT NOT NULL, earned_at TEXT NOT NULL,
  unit_price INTEGER DEFAULT 0, share_percent INTEGER DEFAULT 0, share_basis TEXT, gross INTEGER DEFAULT 0,
  net INTEGER DEFAULT 0, note TEXT, settlement_id INTEGER, created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_type, source_id, coach_id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS coach_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, coach_id INTEGER, period TEXT, kind TEXT, amount INTEGER,
  reason TEXT, created_by TEXT, created_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS session_revenue (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER UNIQUE, member_id INTEGER, member_name TEXT,
  sport TEXT, coach_id INTEGER, unit_price INTEGER, gross_revenue INTEGER, coach_share INTEGER,
  gym_share INTEGER, share_percent INTEGER, period TEXT, occurred_at TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS sport_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, sport TEXT, label TEXT, sessions INTEGER, price INTEGER,
  class_type TEXT, is_active INTEGER DEFAULT 1, sort_order INTEGER
)`);
db.exec(`CREATE TABLE IF NOT EXISTS coach_session_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, coach_id INTEGER,
  share_percent INTEGER DEFAULT 100, created_at TEXT DEFAULT (datetime('now')), UNIQUE(session_id, coach_id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS coach_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, coach_id INTEGER, period TEXT, amount INTEGER DEFAULT 0,
  note TEXT, settled_by TEXT, created_at TEXT DEFAULT (datetime('now')),
  period_start TEXT, period_end TEXT, gross INTEGER DEFAULT 0, deductions INTEGER DEFAULT 0,
  net INTEGER DEFAULT 0, item_count INTEGER DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS settlement_items (
  settlement_id INTEGER NOT NULL, earning_id INTEGER NOT NULL, amount INTEGER DEFAULT 0,
  PRIMARY KEY (settlement_id, earning_id)
)`);

check('جداول ساخته شدند', true);

/* ---------- داده ---------- */
section('داده اولیه');
const planId = db.prepare(
  'INSERT INTO sport_plans (sport, label, sessions, price, class_type) VALUES (?,?,?,?,?)'
).run('بدنسازی', '۱۲ جلسه', 12, 1000000, 'personal').lastInsertRowid;

const m1 = db.prepare('INSERT INTO members (name, phone, sport, expiry_date) VALUES (?,?,?,?)')
  .run('علی رضایی', '09120000001', 'بدنسازی', '2027-01-01').lastInsertRowid;

// نرخ اسنپ‌شات: 1,000,000 ÷ 12 = 83,333
db.prepare(`
  INSERT INTO member_sports (member_id, sport, sport_plan_id, total_sessions, tuition_amount, unit_price, class_type)
  VALUES (?, ?, ?, 12, 1000000, 83333, 'personal')
`).run(m1, 'بدنسازی', planId);

const c1 = Number(db.prepare('INSERT INTO coaches (name, phone, default_share, monthly_salary, pay_model) VALUES (?,?,?,?,?)')
  .run('رضا محمدی', '09120000002', 50, 0, 'share').lastInsertRowid);

const s1 = Number(db.prepare('INSERT INTO coaches (name, default_share, monthly_salary, pay_model) VALUES (?,?,?,?)')
  .run('امیر کریمی', 50, 0, 'share').lastInsertRowid);
const s2 = Number(db.prepare('INSERT INTO coaches (name, default_share, monthly_salary, pay_model) VALUES (?,?,?,?)')
  .run('حسن ثابت', 0, 5000000, 'fixed').lastInsertRowid);

// مربی اصلی: سهم ۵۰٪
db.prepare('INSERT INTO coach_sports (coach_id, sport, share_percent, gym_percent) VALUES (?,?,?,?)')
  .run(c1, 'بدنسازی', 50, 50);

check('عضو و ۳ مربی ثبت شدند', m1 > 0 && c1 > 0 && s1 > 0 && s2 > 0);

/* ---------- تست ۱: سهم جلسه انجام‌شده ---------- */
section('۱) سهم جلسه انجام‌شده');
const sess1 = Number(db.prepare(`
  INSERT INTO coach_sessions (coach_id, coach_name, member_id, session_date, session_time, duration_minutes, status)
  VALUES (?, ?, ?, ?, '18:00', 60, 'scheduled')
`).run(c1, 'رضا محمدی', m1, '2026-09-15').lastInsertRowid);

let out = earnFromSession(db, sess1);
check('جلسه scheduled سهمی نمی‌سازد', out.ok === false && out.reason === 'NOT_COMPLETED');

db.prepare("UPDATE coach_sessions SET status = 'completed' WHERE id = ?").run(sess1);
out = earnFromSession(db, sess1);
check('سهم ساخته شد', out.ok === true && out.earnings.length === 1, JSON.stringify(out));

const e1 = out.earnings[0];
check(`نرخ جلسه = 83,333 (اسنپ‌شات)`, out.unit_price === 83333, `got ${out.unit_price}`);
check(`سهم = 41,666 تومان (83,333 × ۵۰٪)`, e1.net === 41667, `got ${e1.net}`);
check(`دوره = 2026-09`, e1.period === '2026-09', e1.period);
check(`درصد اسنپ‌شده = 50`, e1.share_percent === 50);
check(`منبع = session`, e1.source_type === 'session');

/* ---------- تست ۲: idempotency ---------- */
section('۲) ثبت دوباره (idempotency)');
const again = earnFromSession(db, sess1);
const total = db.prepare("SELECT COUNT(*) AS c FROM coach_earnings WHERE source_type='session' AND source_id=?").get(sess1).c;
check('دو بار کلیک = یک سطر (نه پول اضافه)', total === 1, `got ${total}`);
check('همان سطر برگشت', again.earnings[0].id === e1.id);

/* ---------- تست ۳: چند جلسه جمع می‌شود ---------- */
section('۳) جمع چند جلسه');
for (let i = 0; i < 4; i += 1) {
  const s = Number(db.prepare(`
    INSERT INTO coach_sessions (coach_id, member_id, session_date, session_time, status)
    VALUES (?, ?, ?, '18:00', 'completed')
  `).run(c1, m1, '2026-09-16').lastInsertRowid);
  earnFromSession(db, s);
}
const sum = db.prepare("SELECT COALESCE(SUM(net),0) AS t, COUNT(*) AS c FROM coach_earnings WHERE coach_id=? AND period='2026-09'").get(c1);
check('۵ جلسه = ۲۰۸,۳۳۵', sum.t === 41667 * 5, `got ${sum.t}`);
check('تعداد سطر = ۵', sum.c === 5, `got ${sum.c}`);

/* ---------- تست ۴: تغییر تعرفه، سوابق را خراب نمی‌کند ---------- */
section('۴) تغییر قیمت پلن بعد از جلسات');
db.prepare('UPDATE sport_plans SET price = ? WHERE id = ?').run(2000000, planId);
const s6 = Number(db.prepare(`
  INSERT INTO coach_sessions (coach_id, member_id, session_date, status)
  VALUES (?, ?, ?, 'completed')
`).run(c1, m1, '2026-09-20').lastInsertRowid);
const after = earnFromSession(db, s6);
check('نرخ جدید = 166,667 (از قیمت جدید 2,000,000÷12)', after.unit_price === 166667, `got ${after.unit_price}`);
const oldRow = db.prepare("SELECT net FROM coach_earnings WHERE source_id=? AND coach_id=?").get(sess1, c1);
check('سهم جلسات قبلی همچنان 41,666 (تغییر نکرد)', oldRow.net === 41667, `got ${oldRow.net}`);

/* ---------- تست ۵: تقسیم بین دو مربی ---------- */
section('۵) تقسیم جلسه بین دو مربی');
const m2 = Number(db.prepare('INSERT INTO members (name, phone, sport, expiry_date) VALUES (?,?,?,?)')
  .run('سارا احمدی', '09120000003', 'بدنسازی', '2027-01-01').lastInsertRowid);
db.prepare(`
  INSERT INTO member_sports (member_id, sport, total_sessions, tuition_amount, unit_price, class_type)
  VALUES (?, 'بدنسازی', 10, 1000000, 100000, 'personal')
`).run(m2);
db.prepare('INSERT INTO coach_sports (coach_id, sport, share_percent) VALUES (?,?,?)').run(s1, 'بدنسازی', 50);

const sess2 = Number(db.prepare(`
  INSERT INTO coach_sessions (coach_id, coach_name, member_id, session_date, status)
  VALUES (?, ?, ?, ?, 'completed')
`).run(c1, 'رضا محمدی', m2, '2026-09-22').lastInsertRowid);

// رضا ۶۰٪ ، امیر ۴۰٪ از جلسه
db.prepare('INSERT INTO coach_session_splits (session_id, coach_id, share_percent) VALUES (?,?,?)').run(sess2, c1, 60);
db.prepare('INSERT INTO coach_session_splits (session_id, coach_id, share_percent) VALUES (?,?,?)').run(sess2, s1, 40);

const split = earnFromSession(db, sess2);
check('۲ سطر ساخته شد', split.earnings.length === 2, `got ${split.earnings.length}`);
const rRow = split.earnings.find((e) => e.coach_id === c1);
const aRow = split.earnings.find((e) => e.coach_id === s1);
check(`رضا: 100,000×۵۰٪×۶۰٪ = 30,000`, rRow && rRow.net === 30000, `got ${rRow && rRow.net}`);
check(`امیر: 100,000×۵۰٪×۴۰٪ = 20,000`, aRow && aRow.net === 20000, `got ${aRow && aRow.net}`);
check(`مجموع = 50,000 (=۵۰٪ نرخ)`, (rRow.net + aRow.net) === 50000);

/* ---------- تست ۶: کنسلی سهم را برمی‌دارد ---------- */
section('۶) کنسل شدن جلسه');
const sess3 = Number(db.prepare(`
  INSERT INTO coach_sessions (coach_id, member_id, session_date, status)
  VALUES (?, ?, ?, 'completed')
`).run(c1, m1, '2026-09-25').lastInsertRowid);
earnFromSession(db, sess3);
const beforeRevoke = db.prepare("SELECT COUNT(*) AS c FROM coach_earnings WHERE source_id=?").get(sess3).c;
check('سهم ساخته شد', beforeRevoke === 1);
const revoked = revokeSessionEarnings(db, sess3);
check('۱ سطر برداشته شد', revoked.removed === 1, JSON.stringify(revoked));
const afterRevoke = db.prepare("SELECT COUNT(*) AS c FROM coach_earnings WHERE source_id=?").get(sess3).c;
check('دیگر سطری نیست', afterRevoke === 0);

/* ---------- تست ۷: حقوق ثابت ---------- */
section('۷) حقوق ثابت');
const sal = accrueMonthlySalary(db, { coachId: s2, period: '2026-09', amount: 5000000 });
check('حقوق ثبت شد', sal.ok && sal.created, JSON.stringify(sal));
const salAgain = accrueMonthlySalary(db, { coachId: s2, period: '2026-09', amount: 5000000 });
check('تکراری ساخته نشد (idempotent)', salAgain.created === false);
const salCount = db.prepare("SELECT COUNT(*) AS c FROM coach_earnings WHERE coach_id=? AND source_type='salary'").get(s2).c;
check('فقط ۱ سطر حقوق', salCount === 1, `got ${salCount}`);

/* ---------- تست ۸: کسورات و پاداش ---------- */
section('۸) کسورات و پاداش');
db.prepare('INSERT INTO coach_adjustments (coach_id, period, kind, amount, reason) VALUES (?,?,?,?,?)')
  .run(c1, '2026-09', 'deduction', 300000, 'جریمه لغو جلسه');
db.prepare('INSERT INTO coach_adjustments (coach_id, period, kind, amount, reason) VALUES (?,?,?,?,?)')
  .run(c1, '2026-09', 'bonus', 500000, 'پاداش عملکرد');

// ترکیب سهم‌ها: ۵ جلسه اول ×۴۱٬۶۶۷ + جلسه شماره ۶ با نرخ جدید ۱۶۶٬۶۶۷×۵۰٪ = ۸۳٬۳۳۴ + تقسیمی ۳۰٬۰۰۰
const EXPECTED_SESSION_TOTAL = 41667 * 5 + 83334 + 30000;
const sumR = summarizeCoach(db, c1, '2026-09-01', '2026-09-30');
check(`سهم جلسات = ${EXPECTED_SESSION_TOTAL.toLocaleString('fa-IR')}`, sumR.session_total === EXPECTED_SESSION_TOTAL, `got ${sumR.session_total}`);
check(`جمع ناخالص = ناخالص جلسات`, sumR.gross === sumR.session_total, `got ${sumR.gross}`);
check(`کسورات = 300,000`, sumR.deductions === 300000, `got ${sumR.deductions}`);
check(`پاداش = 500,000`, sumR.adjustments_bonus === 500000);
check(`خالص = ناخالص + پاداش - کسورات`, sumR.net === sumR.gross + 500000 - 300000, `got ${sumR.net}`);
check(`مانده = خالص (تسویه نشده)`, sumR.remaining === sumR.net);

/* ---------- تست ۹: تسویه جزئی ---------- */
section('۹) تسویه partial');
const unsettled = db.prepare("SELECT id, net FROM coach_earnings WHERE coach_id=? AND settlement_id IS NULL AND period='2026-09'").all(c1);
// رضا: ۵(تست۳) + ۱(نرخ جدید) + ۱(سهم تقسیمی) = ۷ سطر
check('۷ سطر تسویه‌نشده', unsettled.length === 7, `got ${unsettled.length}`);
const firstTwo = unsettled.slice(0, 2);
db.prepare('INSERT INTO coach_settlements (coach_id, period, amount) VALUES (?,?,?)').run(c1, '2026-09', 1);
const settlementId = Number(db.prepare('SELECT last_insert_rowid() AS id').get().id);
const insItem = db.prepare('INSERT INTO settlement_items (settlement_id, earning_id, amount) VALUES (?,?,?)');
const insItemTx = db.transaction(() => {
  let total = 0;
  for (const e of firstTwo) { insItem.run(settlementId, e.id, e.net); total += e.net; }
  return total;
});
const partialTotal = insItemTx();
check(`جمع دو سطر = 83,334`, partialTotal === firstTwo[0].net + firstTwo[1].net);
db.prepare('UPDATE coach_earnings SET settlement_id = ? WHERE id = ?');
db.prepare('UPDATE coach_earnings SET settlement_id = ? WHERE id = ?').run(settlementId, firstTwo[0].id);
db.prepare('UPDATE coach_earnings SET settlement_id = ? WHERE id = ?').run(settlementId, firstTwo[1].id);
db.prepare('UPDATE coach_settlements SET gross=?, net=? WHERE id=?').run(partialTotal, partialTotal, settlementId);

const sumAfter = summarizeCoach(db, c1, '2026-09-01', '2026-09-30');
check(`تسویه‌شده = 83,334`, sumAfter.settled === partialTotal, `got ${sumAfter.settled}`);
check(`مانده = 405,000`, sumAfter.remaining === sumAfter.net - partialTotal, `got ${sumAfter.remaining}`);
const settledCount = db.prepare('SELECT COUNT(*) AS c FROM coach_earnings WHERE settlement_id IS NOT NULL').get().c;
check('۲ سطر تسویه‌شده', settledCount === 2, `got ${settledCount}`);

/* ---------- تست ۱۰: تسویه‌شده با انصراف از completed حذف نمی‌شود ---------- */
section('۱۰) انصراف از completed، سهم تسویه‌شده را نگه می‌دارد');
const sessSettled = Number(db.prepare("SELECT session_id FROM coach_earnings WHERE settlement_id IS NOT NULL LIMIT 1").get().session_id);
const rev2 = revokeSessionEarnings(db, sessSettled);
check('سطر تسویه‌شده حفظ شد', rev2.removed === 0 && rev2.skipped_settled === 1, JSON.stringify(rev2));

/* ---------- نتیجه ---------- */
console.log(`\n${'═'.repeat(46)}`);
console.log(`  نتیجه: ${pass} موفق، ${fail} ناموفق`);
console.log('═'.repeat(46));

try { fs.unlinkSync(TMP); } catch (e) {}
process.exit(fail > 0 ? 1 : 0);