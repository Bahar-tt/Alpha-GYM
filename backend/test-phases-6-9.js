/**
 * test-phases-6-9.js — تست تقسیم جلسه، کسورات، تسویه و گزارش‌ها
 * اجرا: node test-phases-6-9.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), `alpha-p69-${Date.now()}.db`);
const Database = require('./sqlite-wrapper');
const {
  setSessionSplits, getSessionSplits, addAdjustment, deleteAdjustment, listAdjustments,
  settleCoach, settlementDetail, cancelSettlement,
  coachProfitability, sportProfitability, forecastMonth, planUtilization,
} = require('./services/coachEarnings');

const db = new Database(TMP);
let pass = 0, fail = 0;
const check = (l, c, e = '') => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  FAIL  ${l}  ${e}`); } };
const section = (t) => console.log(`\n── ${t} ──`);

// ── schema ──
db.exec(`
CREATE TABLE members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, sport TEXT, expiry_date TEXT);
CREATE TABLE member_sports (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER, sport TEXT, sport_plan_id INTEGER,
  weekly_sessions INTEGER, total_sessions INTEGER, used_sessions INTEGER, tuition_amount INTEGER,
  fee_basis TEXT, class_type TEXT, start_date TEXT, expiry_date TEXT, unit_price INTEGER, coach_id INTEGER, coach_name TEXT);
CREATE TABLE coaches (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, is_active INTEGER DEFAULT 1,
  pay_model TEXT DEFAULT 'share', default_share INTEGER DEFAULT 50, monthly_salary INTEGER DEFAULT 0, can_private INTEGER DEFAULT 1, can_program INTEGER DEFAULT 0);
CREATE TABLE coach_sports (id INTEGER PRIMARY KEY AUTOINCREMENT, coach_id INTEGER, sport TEXT,
  commission_percent INTEGER DEFAULT 0, commission_amount INTEGER, share_percent INTEGER DEFAULT 50, gym_percent INTEGER, hourly_rate INTEGER);
CREATE TABLE coach_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, coach_id INTEGER, coach_name TEXT, member_id INTEGER,
  session_date TEXT, session_time TEXT, duration_minutes INTEGER DEFAULT 60, session_type TEXT DEFAULT 'personal',
  status TEXT DEFAULT 'scheduled', notes TEXT, share_percent INTEGER, coach_share_amount INTEGER,
  earnings_id INTEGER, sport TEXT, unit_price INTEGER, split_done INTEGER DEFAULT 0);
CREATE TABLE sport_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, sport TEXT, label TEXT, sessions INTEGER, price INTEGER,
  class_type TEXT, is_active INTEGER DEFAULT 1, sort_order INTEGER);
CREATE TABLE coach_earnings (id INTEGER PRIMARY KEY AUTOINCREMENT, coach_id INTEGER, member_id INTEGER, member_name TEXT,
  sport TEXT, session_id INTEGER, source_type TEXT NOT NULL, source_id INTEGER, period TEXT NOT NULL, earned_at TEXT NOT NULL,
  unit_price INTEGER DEFAULT 0, share_percent INTEGER DEFAULT 0, share_basis TEXT, gross INTEGER DEFAULT 0,
  net INTEGER DEFAULT 0, note TEXT, settlement_id INTEGER, created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_type, source_id, coach_id));
CREATE TABLE coach_adjustments (id INTEGER PRIMARY KEY AUTOINCREMENT, coach_id INTEGER, period TEXT, kind TEXT,
  amount INTEGER, reason TEXT, created_by TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE session_revenue (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER UNIQUE, member_id INTEGER,
  member_name TEXT, sport TEXT, coach_id INTEGER, unit_price INTEGER, gross_revenue INTEGER, coach_share INTEGER,
  gym_share INTEGER, share_percent INTEGER, period TEXT, occurred_at TEXT);
CREATE TABLE coach_session_splits (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, coach_id INTEGER,
  share_percent INTEGER DEFAULT 100, created_at TEXT DEFAULT (datetime('now')), UNIQUE(session_id, coach_id));
CREATE TABLE coach_settlements (id INTEGER PRIMARY KEY AUTOINCREMENT, coach_id INTEGER, period TEXT, amount INTEGER DEFAULT 0,
  note TEXT, settled_by TEXT, created_at TEXT DEFAULT (datetime('now')), period_start TEXT, period_end TEXT,
  gross INTEGER DEFAULT 0, deductions INTEGER DEFAULT 0, net INTEGER DEFAULT 0, item_count INTEGER DEFAULT 0);
CREATE TABLE settlement_items (settlement_id INTEGER NOT NULL, earning_id INTEGER NOT NULL, amount INTEGER DEFAULT 0,
  PRIMARY KEY (settlement_id, earning_id));
`);

// ── داده ──
const { earnFromSession } = require('./services/coachEarnings');
const plan = db.prepare('INSERT INTO sport_plans (sport,label,sessions,price,class_type) VALUES (?,?,?,?,?)')
  .run('بدنسازی', '۱۲ جلسه', 12, 1000000, 'personal').lastInsertRowid;
const m1 = db.prepare('INSERT INTO members (name,phone,sport,expiry_date) VALUES (?,?,?,?)')
  .run('علی', '09120000001', 'بدنسازی', '2027-01-01').lastInsertRowid;
db.prepare(`INSERT INTO member_sports (member_id,sport,sport_plan_id,total_sessions,tuition_amount,unit_price,class_type)
  VALUES (?,?,?,12,1000000,83333,'personal')`).run(m1, 'بدنسازی', plan);

const reza   = Number(db.prepare('INSERT INTO coaches (name,default_share,pay_model) VALUES (?,50,?)').run('رضا', 'share').lastInsertRowid);
const amir   = Number(db.prepare('INSERT INTO coaches (name,default_share,pay_model) VALUES (?,50,?)').run('امیر', 'share').lastInsertRowid);
const salaried = Number(db.prepare('INSERT INTO coaches (name,default_share,pay_model,monthly_salary) VALUES (?,0,?,5000000)').run('حسن', 'fixed').lastInsertRowid);
for (const c of [reza, amir]) {
  db.prepare('INSERT INTO coach_sports (coach_id,sport,share_percent,gym_percent) VALUES (?,?,50,50)').run(c, 'بدنسازی');
}
check('داده اولیه آماده', reza > 0 && amir > 0 && salaried > 0);

function newSession(coachId, date, status = 'scheduled', memberId = m1) {
  return Number(db.prepare(`INSERT INTO coach_sessions (coach_id,member_id,session_date,session_time,status,sport)
    VALUES (?,?,?, '18:00', ?, 'بدنسازی')`).run(coachId, memberId, date, status).lastInsertRowid);
}

/* ═══ فاز ۶: تقسیم جلسه ═══ */
section('فاز ۶ — تقسیم جلسه بین دو مربی');
const s1 = newSession(reza, '2026-09-10', 'completed');
// نرخ هر جلسه = 83,333 ، سهم پایه ۵۰٪ ⇒ 41,667
const BASE = 41667;
check('یک سهم برای رضا (41,667)', earnFromSession(db, s1).earnings[0].net === BASE);

let r = setSessionSplits(db, s1, [{ coach_id: reza, share_percent: 60 }, { coach_id: amir, share_percent: 40 }]);
check('تقسیم ۶۰/۴۰ ثبت شد', r.ok === true, JSON.stringify(r));
check('۲ شریک', r.splits?.length === 2);
const rezaE = db.prepare("SELECT net, share_percent FROM coach_earnings WHERE coach_id=? AND source_id=?").get(reza, s1);
const amirE = db.prepare("SELECT net, share_percent FROM coach_earnings WHERE coach_id=? AND source_id=?").get(amir, s1);
check('رضا = ۸۳,۳۳۳×۵۰٪×۶۰٪ = 25,000', rezaE.net === 25000, `got ${rezaE.net}`);
check('امیر = ۸۳,۳۳۳×۵۰٪×۴۰٪ = 16,667', amirE.net === 16667, `got ${amirE.net}`);
check('مجموع = سهم کامل مربی', rezaE.net + amirE.net === BASE, `got ${rezaE.net + amirE.net}`);
check('درصد ذخیره‌شده = ۵۰ (پایه، نه نهایی)', rezaE.share_percent === 50, `got ${rezaE.share_percent}`);
check('سهم قدیمی رضا جایگزین شد (نه جمع)', rezaE.net === 25000);
check('فقط ۲ سطر (بدون تکرار)', db.prepare('SELECT COUNT(*) c FROM coach_earnings WHERE source_id=?').get(s1).c === 2,
  `got ${db.prepare('SELECT COUNT(*) c FROM coach_earnings WHERE source_id=?').get(s1).c}`);

section('فاز ۶ — اعتبارسنجی');
r = setSessionSplits(db, s1, [{ coach_id: reza, share_percent: 50 }, { coach_id: amir, share_percent: 30 }]);
check('مجموع ≠ ۱۰۰ رد شد', r.ok === false && /۱۰۰/.test(r.error), r.error);
r = setSessionSplits(db, s1, [{ coach_id: reza, share_percent: 100 }]);
check('فقط یک مربی برای تقسیم رد شد', r.ok === false, JSON.stringify(r));
r = setSessionSplits(db, s1, [{ coach_id: reza, share_percent: 50 }, { coach_id: 99999, share_percent: 50 }]);
check('مربی ناموجود رد شد', r.ok === false, JSON.stringify(r));

section('فاز ۶ — برداشتن تقسیم');
r = setSessionSplits(db, s1, []);
check('تقسیم برداشته شد', r.ok === true && r.splits.length === 0);
const only = db.prepare('SELECT * FROM coach_earnings WHERE source_id=?').all(s1);
check('فقط سهم رضا باقی ماند', only.length === 1 && only[0].coach_id === reza, JSON.stringify(only.map((x) => x.coach_id)));
check('نرخ کامل به رضا برگشت (41,667)', only[0].net === BASE, `got ${only[0].net}`);

section('فاز ۶ — ۳ مربی');
const s3 = newSession(reza, '2026-09-11', 'completed');
r = setSessionSplits(db, s3, [
  { coach_id: reza, share_percent: 50 }, { coach_id: amir, share_percent: 30 }, { coach_id: salaried, share_percent: 20 },
]);
check('۳ مربی پذیرفته شد', r.ok === true, JSON.stringify(r));
const sum3 = db.prepare('SELECT COALESCE(SUM(net),0) t FROM coach_earnings WHERE source_id=?').get(s3).t;
// جمع سه سهم گِردشده ممکن است ۱ تومن با سهم کامل فرق داشته باشد — طبیعی است
check(`مجموع ≈ سهم کامل (±۱ گِردشدن)`, Math.abs(sum3 - BASE) <= 1, `got ${sum3} vs ${BASE}`);
check('۳ سطر ساخته شد', db.prepare('SELECT COUNT(*) c FROM coach_earnings WHERE source_id=?').get(s3).c === 3);

section('فاز ۶ — ادغام مربی تکراری');
r = setSessionSplits(db, s3, [
  { coach_id: reza, share_percent: 30 }, { coach_id: reza, share_percent: 20 }, { coach_id: amir, share_percent: 50 },
]);
check('تکراری ادغام شد (۵۰+۵۰)', r.ok === true && r.splits.length === 2, JSON.stringify(r.splits));

/* ═══ فاز ۷: کسورات و پاداش ═══ */
section('فاز ۷ — کسورات و پاداش');
const dedId = addAdjustment(db, { coachId: reza, period: '2026-09', kind: 'deduction', amount: 300000, reason: 'جریمه لغو' }).id;
check('کسر ثبت شد', !!dedId);
const bonusId = addAdjustment(db, { coachId: reza, period: '2026-09', kind: 'bonus', amount: 500000, reason: 'پاداش عملکرد' }).id;
check('پاداش ثبت شد', !!bonusId);
r = addAdjustment(db, { coachId: reza, period: '2026-09', kind: 'gift', amount: 100000 });
check('نوع نامعتبر رد شد', r.ok === false, r.error);
r = addAdjustment(db, { coachId: reza, period: '2026-09', kind: 'bonus', amount: -500 });
check('مبلغ منفی رد شد', r.ok === false, r.error);
check('۲ آیتم فهرست', listAdjustments(db, reza, '2026-09').length === 2);
r = deleteAdjustment(db, dedId);
check('حذف کسر', r.ok === true, JSON.stringify(r));
deleteAdjustment(db, bonusId);
check('۰ آیتم باقی ماند (پاک‌سازی)', listAdjustments(db, reza, '2026-09').length === 0,
  `got ${listAdjustments(db, reza, '2026-09').length}`);

section('فاز ۷ — کسورات در تسویه');
addAdjustment(db, { coachId: reza, period: '2026-09', kind: 'deduction', amount: 100000, reason: 'جریمه' });
addAdjustment(db, { coachId: reza, period: '2026-09', kind: 'bonus', amount: 200000, reason: 'پاداش' });
const rezaGross = db.prepare("SELECT COALESCE(SUM(net),0) t FROM coach_earnings WHERE coach_id=? AND settlement_id IS NULL").get(reza).t;
check(`ناخالص رضا = ${rezaGross.toLocaleString('fa-IR')}`, rezaGross > 0, `got ${rezaGross}`);

const expectedItems = db.prepare('SELECT COUNT(*) c FROM coach_earnings WHERE coach_id=? AND settlement_id IS NULL').get(reza).c;
const expectNet = rezaGross + 200000 - 100000;
const setRes = settleCoach(db, { coachId: reza, period: '2026-09', note: 'تست', actor: 'مدیر' });
check('تسویه انجام شد', setRes.ok === true, JSON.stringify(setRes));
check(`خالص = ناخالص + پاداش − کسورات = ${expectNet.toLocaleString('fa-IR')}`, setRes.net === expectNet, `got ${setRes.net}`);
check(`همه آیتم‌ها تسویه شدند (${expectedItems})`, setRes.items === expectedItems, `got ${setRes.items}`);
check('دوره ذخیره شد', setRes.settlement.period === '2026-09');
check('بازه ذخیره شد', setRes.settlement.period_start === '2026-09-01' && setRes.settlement.period_end === '2026-09-31');
check('settled_by ثبت شد', setRes.settlement.settled_by === 'مدیر', setRes.settlement.settled_by);

section('فاز ۸ — ریز تسویه');
const detail = settlementDetail(db, setRes.settlement_id);
check(`ریز بارگذاری شد (${expectedItems} آیتم)`, detail && detail.items.length === expectedItems, `got ${detail?.items?.length}`);
check(`${expectedItems} سطر settlement_items`, db.prepare('SELECT COUNT(*) c FROM settlement_items WHERE settlement_id=?').get(setRes.settlement_id).c === expectedItems);
check('نام مربی در ریز', detail.coach.name === 'رضا');
check('کسورات دوره در ریز', detail.adjustments.length === 2, `got ${detail.adjustments.length}`);

section('فاز ۸ — تسویه تکراری');
r = settleCoach(db, { coachId: reza, period: '2026-09' });
check('تسویه دوباره رد شد (چیزی نمانده)', r.ok === false, JSON.stringify(r));

section('فاز ۸ — لغو تسویه');
r = cancelSettlement(db, setRes.settlement_id);
check('لغو شد', r.ok === true);
check('سهم‌ها برگشتند', db.prepare('SELECT COUNT(*) c FROM coach_earnings WHERE coach_id=? AND settlement_id IS NULL').get(reza).c === expectedItems,
  `got ${db.prepare('SELECT COUNT(*) c FROM coach_earnings WHERE coach_id=? AND settlement_id IS NULL').get(reza).c}`);
check('settlement_items پاک شد', db.prepare('SELECT COUNT(*) c FROM settlement_items WHERE settlement_id=?').get(setRes.settlement_id).c === 0);
r = settleCoach(db, { coachId: reza, period: '2026-09' });
check('دوباره تسویه شد', r.ok === true, JSON.stringify(r));

section('فاز ۸ — حقوق ثابت خودکار در تسویه');
const salSet = settleCoach(db, { coachId: salaried, period: '2026-09', actor: 'مدیر' });
check('تسویه حقوق ثابت موفق', salSet.ok === true, JSON.stringify(salSet));
check('حقوق ۵,۰۰۰,۰۰۰ ثبت و تسویه شد', salSet.net === 5000000, `got ${salSet.net}`);
check('سطر حقوق ساخته شد', db.prepare("SELECT COUNT(*) c FROM coach_earnings WHERE coach_id=? AND source_type='salary'").get(salaried).c === 1);
const salSet2 = settleCoach(db, { coachId: salaried, period: '2026-09' });
check('ماه بعده حقوق دوباره ساخته نشد', salSet2.ok === false, JSON.stringify(salSet2));

section('فاز ۸ — تسویه گروهی');
const group = [amir].map((cid) => settleCoach(db, { coachId: cid, period: '2026-09', actor: 'مدیر' }));
check('تسویه گروهی', group[0].ok === true, JSON.stringify(group[0]));

/* ═══ فاز ۹: گزارش‌ها ═══ */
section('فاز ۹ — داشبورد سودآوری مربیان');
const prof = coachProfitability(db, '2026-09-01', '2026-09-30');
check('۳ مربی در گزارش', prof.length === 3, `got ${prof.length}`);
const pReza = prof.find((p) => p.id === reza);
const rezaSession = db.prepare("SELECT COALESCE(SUM(net),0) t FROM coach_earnings WHERE coach_id=?").get(reza).t;
const expectProfNet = rezaSession + 200000 - 100000;
check(`رضا: ناخالص = ${rezaSession.toLocaleString('fa-IR')}`, pReza.gross === rezaSession, `got ${pReza.gross}`);
check('رضا: کسورات ۱۰۰,۰۰۰', pReza.deductions === 100000, `got ${pReza.deductions}`);
check('رضا: پاداش ۲۰۰,۰۰۰', pReza.bonuses === 200000, `got ${pReza.bonuses}`);
check(`رضا: خالص = ${expectProfNet.toLocaleString('fa-IR')}`, pReza.net === expectProfNet, `got ${pReza.net}`);
check('رضا: تسویه‌شده = سهم جلسات (کسورات یک‌بار در تسویه)', pReza.settled === rezaSession, `settled ${pReza.settled} vs sessions ${rezaSession}`);
check('رضا: مانده = پاداش − کسورات', pReza.remaining === pReza.net - rezaSession, `got ${pReza.remaining}`);
check('رضا: ۲ جلسه ثبت‌شده', pReza.sessions === 2, `got ${pReza.sessions}`);
check('درآمد کل = ۲×۸۳,۳۳۳', pReza.revenue === 83333 * 2, `got ${pReza.revenue}`);
check('سهم باشگاه = ۸۳,۳۳۴ (گِرد شده)', pReza.gym_share === 83334, `got ${pReza.gym_share}`);
const pSal = prof.find((p) => p.id === salaried);
check('حسن: حقوق ثابت ۵,۰۰۰,۰۰۰', pSal.salary_total === 5000000, `got ${pSal.salary_total}`);

section('فاز ۹ — سودآوری رشته');
const sp = sportProfitability(db, '2026-09-01', '2026-09-30');
check('یک رشته گزارش شد', sp.length === 1, `got ${sp.length}`);
check('۲ جلسه', sp[0].sessions === 2, `got ${sp[0].sessions}`);
check(`درآمد = ۲×۸۳,۳۳۳`, sp[0].revenue === 83333 * 2, `got ${sp[0].revenue}`);
const allCoachPaid = db.prepare("SELECT COALESCE(SUM(net),0) t FROM coach_earnings WHERE source_type='session'").get().t;
check(`سهم مربیان = ${allCoachPaid.toLocaleString('fa-IR')}`, sp[0].coach_paid === allCoachPaid, `got ${sp[0].coach_paid}`);
check('سهم باشگاه = ۸۳,۳۳۴ (گِرد شده)', sp[0].gym_share === 83334, `got ${sp[0].gym_share}`);
check('سود خالص = سهم باشگاه − سهم مربیان', sp[0].net_profit === sp[0].gym_share - sp[0].coach_paid, `got ${sp[0].net_profit}`);

section('فاز ۹ — پیش‌بینی ماه');
const fc = forecastMonth(db, reza, '2026-09');
check('دوره', fc.period === '2026-09');
check('روزهای گذشته > ۰', fc.days_passed > 0);
check('پیش‌بینی >= جلسات ثبت‌شده', fc.projected_sessions >= fc.session_total, `${fc.projected_sessions} vs ${fc.session_total}`);

section('فاز ۹ — تطبیق پلن');
const pu = planUtilization(db, m1);
check('۱ ردیف پلن', pu.length === 1);
check('۱۲ جلسه کل', pu[0].total_sessions === 12);
check('نرخ واحد ۸۳,۳۳۳', pu[0].unit_price === 83333, `got ${pu[0].unit_price}`);
check('۱ جلسه استفاده‌شده از موتور', pu[0].earned_sessions >= 1, `got ${pu[0].earned_sessions}`);
db.prepare('UPDATE member_sports SET used_sessions = 4 WHERE member_id = ?').run(m1);
const pu2 = planUtilization(db, m1);
check('۸ جلسه باقی‌مانده', pu2[0].remaining_sessions === 8, `got ${pu2[0].remaining_sessions}`);
check('ارزش باقی‌مانده = ۸×۸۳,۳۳۳ = ۶۶۶,۶۶۴', pu2[0].remaining_value === 666664, `got ${pu2[0].remaining_value}`);

console.log(`\n${'═'.repeat(50)}`);
console.log(`  نتیجه: ${pass} موفق، ${fail} ناموفق`);
console.log('═'.repeat(50));
try { fs.unlinkSync(TMP); } catch {}
process.exit(fail > 0 ? 1 : 0);