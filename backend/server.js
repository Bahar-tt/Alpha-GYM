const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Database = require('./sqlite-wrapper');
const path = require('path');
const fs = require('fs');
const { todayJalali } = require('./utils/date');
const { onMemberCreated } = require('./services/eventService');
const { sendSMS } = require('./services/smsService');
const cron = require('node-cron');
const { startCrons } = require('./services/cronManager');
const { generateMembersExcel, latestExportPath } = require('./services/excelExport');
const {
  DEFAULT_SHARE_PERCENT,
  isoDate,
  periodOf,
  earnFromSession,
  revokeSessionEarnings,
  accrueMonthlySalary,
} = require('./services/coachEarnings');

const PORT = 3001;
const ENV = process.env.NODE_ENV || 'development';
const DB_PATH = path.join(__dirname, 'gym.db');

console.log(`[ENV] Running in ${ENV}`);

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database(DB_PATH);

/* =========================
   DATABASE SCHEMA
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    start_date TEXT,
    weekly_sessions INTEGER NOT NULL DEFAULT 0,
    birthday TEXT,
    national_id TEXT,
    referrer TEXT,
    sport TEXT,
    tuition_amount INTEGER,
    fee_basis TEXT,
    class_type TEXT,
    has_insurance INTEGER NOT NULL DEFAULT 0
  )
`);

// ✅ Migrate existing DBs: add new columns if missing (idempotent)
const memberColumns = db.prepare(`PRAGMA table_info(members)`).all().map((c) => c.name);
const newMemberColumns = [
  ['start_date',      'TEXT'],
  ['national_id',     'TEXT'],
  ['referrer',        'TEXT'],
  ['sport',           'TEXT'],
  ['tuition_amount',  'INTEGER'],
  ['fee_basis',       'TEXT'],
  ['class_type',      'TEXT'],
  ['has_insurance',   'INTEGER NOT NULL DEFAULT 0'],
  ['total_sessions',  'INTEGER NOT NULL DEFAULT 0'],
  ['used_sessions',   'INTEGER NOT NULL DEFAULT 0'],
  ['notes',           'TEXT'],
  ['membership_type', 'TEXT'],
  ['goal',            'TEXT'],
  ['member_code',     'TEXT'],
];
for (const [col, def] of newMemberColumns) {
  if (!memberColumns.includes(col)) {
    db.exec(`ALTER TABLE members ADD COLUMN ${col} ${def}`);
  }
}

// ✅ بک‌فیل کد عضویت برای رکوردهای موجود
// کد عضویت عددی خالص و یکتا است و بعداً با شماره‌ی کاربری دستگاه اسکنر انگشت منطبق می‌شود.
if (!memberColumns.includes('member_code')) {
  const nextId = db.prepare('SELECT COALESCE(MAX(CAST(member_code AS INTEGER)), 0) + 1 AS next FROM members').get();
  let nextCode = Number(nextId ? nextId.next : 1);
  const fill = db.transaction(() => {
    const rows = db.prepare('SELECT id FROM members WHERE member_code IS NULL OR member_code = \'\' ORDER BY id').all();
    const upd = db.prepare('UPDATE members SET member_code = ? WHERE id = ?');
    for (const r of rows) {
      upd.run(String(nextCode), r.id);
      nextCode++;
    }
  });
  fill();
  console.log('[MIGRATE] member_code backfilled');
}

// ✅ جدول اشتراک‌های ورزشی هر عضو (مدل چندرشته‌ای)
// هر عضو یک رکورد در members دارد (فرد) و هر رشته‌ی ثبت‌نامی یک سطر در این جدول.
db.exec(`
  CREATE TABLE IF NOT EXISTS member_sports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    sport TEXT NOT NULL DEFAULT '',
    sport_plan_key TEXT,
    weekly_sessions INTEGER NOT NULL DEFAULT 0,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    used_sessions INTEGER NOT NULL DEFAULT 0,
    tuition_amount INTEGER,
    fee_basis TEXT,
    class_type TEXT,
    start_date TEXT,
    expiry_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ✅ مهاجرت: منتقل کردن داده‌های تک‌رشته‌ای قبلی از members به member_sports
// (فقط یک‌بار اجرا می‌شود؛ اگر جدول خالی بود یعنی مهاجرت هنوز انجام نشده)
const msCount = db.prepare('SELECT COUNT(*) AS c FROM member_sports').get().c;
if (msCount === 0) {
  const mrows = db.prepare('SELECT * FROM members ORDER BY id').all();
  const insMs = db.prepare(`
    INSERT INTO member_sports
      (member_id, sport, sport_plan_key, weekly_sessions, total_sessions, used_sessions,
       tuition_amount, fee_basis, class_type, start_date, expiry_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const migrate = db.transaction(() => {
    for (const m of mrows) {
      insMs.run(
        m.id,
        m.sport || '',
        null,
        m.weekly_sessions || 0,
        m.total_sessions || 0,
        m.used_sessions || 0,
        m.tuition_amount != null ? Number(m.tuition_amount) : null,
        m.fee_basis || null,
        m.class_type || null,
        m.start_date || null,
        m.expiry_date
      );
    }
  });
  migrate();
  console.log(`[MIGRATE] member_sports seeded from ${mrows.length} members`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS sms_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    name TEXT,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'sent',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS renewals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    sport_id INTEGER,
    membership_type TEXT,
    old_end_date TEXT,
    new_end_date TEXT,
    amount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    renewed_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ✅ مهاجرت: افزودن sport_id به renewals اگر وجود ندارد
const renewalColumns = db.prepare(`PRAGMA table_info(renewals)`).all().map((c) => c.name);
if (!renewalColumns.includes('sport_id')) {
  db.exec(`ALTER TABLE renewals ADD COLUMN sport_id INTEGER`);
}

// ✅ ستون‌های ردیابی (چه کسی / چه زمانی) روی members
const memberCols2 = db.prepare(`PRAGMA table_info(members)`).all().map((c) => c.name);
const trackCols = [
  ['created_by', 'TEXT'],
  ['updated_by', 'TEXT'],
  ['updated_at', 'TEXT'],
];
for (const [col, def] of trackCols) {
  if (!memberCols2.includes(col)) {
    db.exec(`ALTER TABLE members ADD COLUMN ${col} ${def}`);
  }
}

/* =========================
   STAFF / AUTH (مدیریت کاربران)
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'staff',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    staff_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    actor_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    member_id INTEGER,
    detail TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

/* =========================
   ACCOUNTING (حسابداری)
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS coaches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS coach_sports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER NOT NULL,
    sport TEXT NOT NULL,
    commission_percent INTEGER NOT NULL DEFAULT 0,
    commission_amount INTEGER
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    member_name TEXT,
    sport TEXT,
    coach_id INTEGER,
    coach_share INTEGER NOT NULL DEFAULT 0,
    amount INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'renewal',
    method TEXT NOT NULL DEFAULT 'cash',
    note TEXT,
    received_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'عمومی',
    date TEXT NOT NULL DEFAULT (date('now')),
    note TEXT,
    recorded_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS coach_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    settled_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

/* =========================
   پورتال مربی (جلسات)
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS coach_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER NOT NULL,
    coach_name TEXT,
    member_id INTEGER NOT NULL,
    session_date TEXT NOT NULL,
    session_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    session_type TEXT NOT NULL DEFAULT 'personal',
    status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

/* =========================
   پیام‌رسانی هوشمند
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    sender_name TEXT,
    recipient_type TEXT NOT NULL,
    recipient_id INTEGER,
    subject TEXT,
    body TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'sms',
    status TEXT NOT NULL DEFAULT 'draft',
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

/* =========================
   برنامه‌های تمرینی مربی
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS workout_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    coach_id INTEGER,
    coach_name TEXT,
    title TEXT NOT NULL,
    goal TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS workout_program_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL,
    day TEXT NOT NULL DEFAULT '1',
    exercise TEXT NOT NULL,
    sets INTEGER NOT NULL DEFAULT 3,
    reps TEXT NOT NULL DEFAULT '10',
    weight TEXT,
    rest TEXT,
    notes TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  )
`);

/* =========================
   اشتراک پنل مربی (حق عضویت مربی)
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS coach_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_staff_id INTEGER NOT NULL,
    plan TEXT NOT NULL DEFAULT 'monthly',
    amount INTEGER NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    note TEXT,
    settled_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

/* =========================
   موتور سهم مربی (Coach Earnings Engine)
   =========================
   منبع واحد حقیقت برای «بدهی باشگاه به مربی».

   اصول طراحی:
   ۱) هر سطر = یک سهم مستقل و قابل ردیابی (session / salary / bonus / adjustment)
   ۲) نرخ و درصد در لحظه اسنپ‌شات می‌شوند تا تغییر بعدیِ تعرفه، سوابق را خراب نکند
   ۳) UNIQUE(source_type, source_id, coach_id) ⇒ ثبت دوباره یک جلسه، پول اضافه نمی‌سازد
   ۴) تسویه per-row است تا تسویه جزئی دقیق و قابل ممیزی باشد
========================= */

// ── کاتالوگ پلن‌های شهریه (پیش‌تر در فرانت‌اند hardcode بود) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS sport_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sport TEXT NOT NULL,
    label TEXT NOT NULL,
    sessions INTEGER NOT NULL,
    price INTEGER NOT NULL,
    class_type TEXT NOT NULL DEFAULT 'group',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sport_plans_sport ON sport_plans(sport, is_active)`);

// ── سهم‌های محاسبه‌شده مربی ──
db.exec(`
  CREATE TABLE IF NOT EXISTS coach_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER NOT NULL,
    member_id INTEGER,
    member_name TEXT,
    sport TEXT,
    session_id INTEGER,
    source_type TEXT NOT NULL,
    source_id INTEGER,
    period TEXT NOT NULL,
    earned_at TEXT NOT NULL,
    unit_price INTEGER NOT NULL DEFAULT 0,
    share_percent INTEGER NOT NULL DEFAULT 0,
    share_basis TEXT NOT NULL DEFAULT 'revenue',
    gross INTEGER NOT NULL DEFAULT 0,
    net INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    settlement_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source_type, source_id, coach_id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_earnings_coach_period ON coach_earnings(coach_id, period)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_earnings_settlement ON coach_earnings(settlement_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_earnings_member ON coach_earnings(member_id)`);

// ── پاداش و کسورات (جریمه، مساعده، پاداش عملکرد) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS coach_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_adjustments_coach_period ON coach_adjustments(coach_id, period)`);

// ── آیتم‌های تسویه: هر تسویه بابت کدام سهم‌ها بود ──
db.exec(`
  CREATE TABLE IF NOT EXISTS settlement_items (
    settlement_id INTEGER NOT NULL,
    earning_id INTEGER NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (settlement_id, earning_id)
  )
`);

// ── سهم پلتفرم/باشگاه از هر جلسه (برای داشبورد سودآوری) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS session_revenue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    member_id INTEGER,
    member_name TEXT,
    sport TEXT,
    coach_id INTEGER NOT NULL,
    unit_price INTEGER NOT NULL DEFAULT 0,
    gross_revenue INTEGER NOT NULL DEFAULT 0,
    coach_share INTEGER NOT NULL DEFAULT 0,
    gym_share INTEGER NOT NULL DEFAULT 0,
    share_percent INTEGER NOT NULL DEFAULT 0,
    period TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(session_id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_session_revenue_coach ON session_revenue(coach_id, period)`);

// ── ارتقای جدول‌های موجود ──

// اسنپ‌شات نرخ هر جلسه روی member_sports تا تغییر تعرفه، سوابق را خراب نکند
const msCols = db.prepare(`PRAGMA table_info(member_sports)`).all().map((c) => c.name);
for (const [col, def] of [
  ['sport_plan_id',   'INTEGER'],
  ['unit_price',      'INTEGER'],
  ['class_type',      'TEXT'],
]) {
  if (!msCols.includes(col)) db.exec(`ALTER TABLE member_sports ADD COLUMN ${col} ${def}`);
}

// سهم مربی هر جلسه (برای بازمحاسبه/اصلاح دستی)
const csCols = db.prepare(`PRAGMA table_info(coach_sessions)`).all().map((c) => c.name);
for (const [col, def] of [
  ['share_percent',     'INTEGER'],
  ['coach_share_amount','INTEGER'],
  ['earnings_id',       'INTEGER'],
  ['sport',             'TEXT'],
  ['unit_price',        'INTEGER'],
  ['split_done',        'INTEGER NOT NULL DEFAULT 0'],
]) {
  if (!csCols.includes(col)) db.exec(`ALTER TABLE coach_sessions ADD COLUMN ${col} ${def}`);
}

// نرخ و درصد اختصاصی مربی روی هر رشته (پیش‌فرض: ۵۰٪ از قیمت پلن)
const cspCols = db.prepare(`PRAGMA table_info(coach_sports)`).all().map((c) => c.name);
for (const [col, def] of [
  ['share_percent',        'INTEGER NOT NULL DEFAULT 50'],
  ['hourly_rate',          'INTEGER'],
  ['default_share_percent','INTEGER NOT NULL DEFAULT 50'],
  ['gym_percent',          'INTEGER'],
]) {
  if (!cspCols.includes(col)) db.exec(`ALTER TABLE coach_sports ADD COLUMN ${col} ${def}`);
}

// تقسیم یک جلسه بین چند مربی (مثال: برنامه ترکیبی بدنسازی + TRX)
db.exec(`
  CREATE TABLE IF NOT EXISTS coach_session_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    coach_id INTEGER NOT NULL,
    share_percent INTEGER NOT NULL DEFAULT 100,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(session_id, coach_id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_splits_session ON coach_session_splits(session_id)`);

// مدل حقوق مربی: share / fixed / hybrid
const coachCols = db.prepare(`PRAGMA table_info(coaches)`).all().map((c) => c.name);
for (const [col, def] of [
  ['pay_model',      "TEXT NOT NULL DEFAULT 'share'"],
  ['default_share',  'INTEGER NOT NULL DEFAULT 50'],
  ['monthly_salary', 'INTEGER NOT NULL DEFAULT 0'],
  ['notes',          'TEXT'],
]) {
  if (!coachCols.includes(col)) db.exec(`ALTER TABLE coaches ADD COLUMN ${col} ${def}`);
}

// جزئیات تسویه
const settleCols = db.prepare(`PRAGMA table_info(coach_settlements)`).all().map((c) => c.name);
for (const [col, def] of [
  ['period_start', 'TEXT'],
  ['period_end',   'TEXT'],
  ['gross',        'INTEGER NOT NULL DEFAULT 0'],
  ['deductions',   'INTEGER NOT NULL DEFAULT 0'],
  ['net',          'INTEGER NOT NULL DEFAULT 0'],
  ['item_count',   'INTEGER NOT NULL DEFAULT 0'],
]) {
  if (!settleCols.includes(col)) db.exec(`ALTER TABLE coach_settlements ADD COLUMN ${col} ${def}`);
}

// ── seed کاتالوگ پلن‌ها از مقادیر فعلی فرانت‌اند ──
const DEFAULT_SPORT_PLANS = [
  ['بدنسازی', '۸ جلسه', 8, 850000, 'group', 1],
  ['بدنسازی', '۱۲ جلسه', 12, 1000000, 'personal', 2],
  ['بدنسازی', '۱۶ جلسه', 16, 1200000, 'personal', 3],
  ['بدنسازی', '۲۴ جلسه', 24, 1500000, 'personal', 4],
  ['کراس‌فیت', '۱۲ جلسه', 12, 1200000, 'personal', 5],
  ['فانکشنال فیتنس', '۱۲ جلسه', 12, 800000, 'group', 6],
  ['فری‌استایل', '۱۲ جلسه', 12, 800000, 'group', 7],
  ['بادی‌پامپ', '۱۲ جلسه', 12, 1000000, 'personal', 8],
  ['های‌روکس', '۱۲ جلسه', 12, 1000000, 'personal', 9],
  ['اریال', '۱۲ جلسه', 12, 1000000, 'group', 10],
  ['بوکس', '۱۲ جلسه', 12, 950000, 'personal', 11],
  ['TRX', '۱۲ جلسه', 12, 850000, 'group', 12],
  ['زومبا', '۱۲ جلسه', 12, 800000, 'group', 13],
  ['رقص ایرانی', '۱۲ جلسه', 12, 800000, 'group', 14],
  ['یوگا', '۱۲ جلسه', 12, 800000, 'group', 15],
  ['ایروفیتنس', '۱۲ جلسه', 12, 800000, 'group', 16],
  ['پیلاتس', '۱۲ جلسه', 12, 800000, 'group', 17],
];
{
  const count = db.prepare('SELECT COUNT(*) AS c FROM sport_plans').get().c;
  if (count === 0) {
    const ins = db.prepare(
      'INSERT INTO sport_plans (sport, label, sessions, price, class_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const seedAll = db.transaction(() => {
      for (const [sport, label, sessions, price, classType, order] of DEFAULT_SPORT_PLANS) {
        ins.run(sport, label, sessions, price, classType, order);
      }
    });
    seedAll();
    console.log(`[MIGRATE] sport_plans seeded (${DEFAULT_SPORT_PLANS.length} plans)`);
  }
}

// بک‌فیل نرخ هر جلسه برای عضوهایی که unit_price ندارند
{
  const need = db.prepare(
    'SELECT id, tuition_amount, total_sessions FROM member_sports WHERE tuition_amount IS NOT NULL AND tuition_amount > 0 AND total_sessions > 0'
  ).all();
  if (need.length) {
    const upd = db.prepare('UPDATE member_sports SET unit_price = ? WHERE id = ?');
    const backfill = db.transaction(() => {
      for (const s of need) {
        const unit = Math.round(Number(s.tuition_amount) / Number(s.total_sessions));
        if (unit > 0) upd.run(unit, s.id);
      }
    });
    backfill();
    console.log(`[MIGRATE] member_sports.unit_price backfilled (${need.length} rows)`);
  }
}

// ✅ seed فِلگ‌های ویژگی (پیش‌فرض غیرفعال → فعال‌سازی پولی توسط سرویس‌دهنده)
const insFlag = db.prepare(`INSERT OR IGNORE INTO feature_flags (key, enabled) VALUES (?, ?)`);
insFlag.run('accounting', 0);
insFlag.run('attendance', 0);
insFlag.run('coach_portal', 0);
insFlag.run('messaging', 0);

function featureEnabled(key) {
  const row = db.prepare(`SELECT enabled FROM feature_flags WHERE key = ?`).get(key);
  return !!(row && row.enabled);
}

// ✅ میدلور قفل ویژگی (بخش‌های پولی)
function requireFeature(key) {
  return (req, res, next) => {
    if (!featureEnabled(key)) {
      return res.status(403).json({
        error: 'FEATURE_LOCKED',
        message: 'این بخش ویژه فعال نشده است. برای فعال‌سازی با پشتیبانی تماس بگیرید.',
      });
    }
    next();
  };
}

// ✅ هش رمز عبور با scrypt (بدون وابستگی خارجی)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ✅ seed کاربران پیش‌فرض (فقط اولین اجرا)
const staffCount = db.prepare('SELECT COUNT(*) AS c FROM staff').get().c;
if (staffCount === 0) {
  const insStaff = db.prepare(
    `INSERT INTO staff (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`
  );
  const seedTx = db.transaction(() => {
    insStaff.run('admin', hashPassword('admin123'), 'مدیر سیستم', 'admin');
    insStaff.run('staff', hashPassword('staff123'), 'منشی', 'staff');
  });
  seedTx();
  console.log('[AUTH] Default staff seeded (admin/admin123 , staff/staff123)');
}

// ✅ ساخت نشست + نمایش عمومی کاربر
function createSession(staff) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO sessions (token, staff_id, expires_at) VALUES (?, ?, ?)`)
    .run(token, staff.id, expiresAt);
  return token;
}

function publicStaff(staff) {
  if (!staff) return null;
  return {
    id: String(staff.id),
    username: staff.username,
    full_name: staff.full_name,
    role: staff.role,
    is_active: !!staff.is_active,
    created_at: staff.created_at,
    last_login_at: staff.last_login_at,
    features: {
      accounting: featureEnabled('accounting'),
      attendance: featureEnabled('attendance'),
      coach_portal: featureEnabled('coach_portal'),
      messaging: featureEnabled('messaging'),
    },
  };
}

const PROVIDER_KEY = process.env.PROVIDER_KEY || 'alpha-change-me';

// ✅ اندپوینت سرویس‌دهنده برای فعال/غیرفعال کردن بخش‌های پولی
app.post('/provider/feature', (req, res) => {
  const key = (req.headers['x-provider-key'] || '').toString();
  if (key !== PROVIDER_KEY) {
    return res.status(401).json({ error: 'کلید سرویس‌دهنده نامعتبر است' });
  }
  const { feature, enabled } = req.body || {};
  const valid = ['accounting', 'attendance', 'coach_portal', 'messaging'];
  if (!valid.includes(feature)) {
    return res.status(400).json({ error: 'ویژگی نامعتبر است' });
  }
  db.prepare(`UPDATE feature_flags SET enabled = ?, updated_at = datetime('now') WHERE key = ?`)
    .run(enabled ? 1 : 0, feature);
  res.json({ ok: true, feature, enabled: !!enabled });
});

// ✅ میدلور احراز هویت + نقش
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'احراز هویت لازم است' });
  const session = db.prepare(`SELECT * FROM sessions WHERE token = ?`).get(token);
  if (!session) return res.status(401).json({ error: 'نشست نامعتبر است' });
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    return res.status(401).json({ error: 'نشست منقضی شده است' });
  }
  const staff = db.prepare(`SELECT * FROM staff WHERE id = ?`).get(session.staff_id);
  if (!staff || !staff.is_active) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    return res.status(401).json({ error: 'دسترسی غیرفعال است' });
  }
  req.staff = staff;
  req.token = token;
  next();
}

function requireAdmin(req, res, next) {
  if (req.staff?.role !== 'admin') {
    return res.status(403).json({ error: 'فقط مدیر سیستم اجازه این عملیات را دارد' });
  }
  next();
}

// ✅ ثبت رخداد در audit_logs
function audit(req, action, { entityType, entityId, memberId, detail } = {}) {
  const actor = req.staff || null;
  db.prepare(`
    INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, member_id, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    actor ? actor.id : null,
    actor ? actor.full_name : 'سیستم',
    action,
    entityType || null,
    entityId != null ? Number(entityId) : null,
    memberId != null ? Number(memberId) : null,
    detail ? JSON.stringify(detail) : null
  );
}

/* =========================
   AUTH ROUTES
========================= */

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
  }
  const staff = db
    .prepare(`SELECT * FROM staff WHERE username = ? COLLATE NOCASE`)
    .get(String(username).trim());
  if (!staff || !verifyPassword(String(password), staff.password_hash)) {
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
  }
  if (!staff.is_active) {
    return res.status(403).json({ error: 'حساب کاربری شما غیرفعال است' });
  }
  const token = createSession(staff);
  db.prepare(`UPDATE staff SET last_login_at = datetime('now') WHERE id = ?`).run(staff.id);
  req.staff = staff;
  audit(req, 'auth.login', { entityType: 'staff', entityId: staff.id });
  res.json({ token, user: publicStaff(staff) });
});

app.post('/auth/logout', requireAuth, (req, res) => {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(req.token);
  audit(req, 'auth.logout', { entityType: 'staff', entityId: req.staff.id });
  res.json({ ok: true });
});

app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicStaff(req.staff) });
});

app.post('/auth/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'رمز عبور فعلی و جدید الزامی است' });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد' });
  }
  if (!verifyPassword(String(current_password), req.staff.password_hash)) {
    return res.status(401).json({ error: 'رمز عبور فعلی اشتباه است' });
  }
  db.prepare(`UPDATE staff SET password_hash = ? WHERE id = ?`)
    .run(hashPassword(String(new_password)), req.staff.id);
  audit(req, 'auth.password_change', { entityType: 'staff', entityId: req.staff.id });
  res.json({ ok: true });
});

// ─── بازیابی رمز عبور (فراموشی رمز) ─────────────────────────────────────────

// درخواست کد بازیابی — ارسال کد به شماره تلفن مدیر
app.post('/auth/forgot-password', (req, res) => {
  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: 'نام کاربری الزامی است' });
  }
  const staff = db.prepare(`SELECT * FROM staff WHERE username = ? COLLATE NOCASE`).get(String(username).trim());
  if (!staff) {
    // برای امنیت، پیام یکسان می‌دهیم تا نام کاربری لو نره
    return res.json({ ok: true, message: 'اگر این نام کاربری وجود دارد، کد بازیابی ارسال خواهد شد' });
  }
  if (!staff.is_active) {
    return res.status(403).json({ error: 'حساب کاربری غیرفعال است' });
  }

  // تولید کد ۶ رقمی
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // ۱۰ دقیقه

  // ذخیره کد در دیتابیس
  db.prepare(`INSERT INTO password_resets (staff_id, code, expires_at) VALUES (?, ?, ?)`)
    .run(staff.id, code, expiresAt);

  // ارسال پیامک (اگر سرویس SMS فعال باشه)
  try {
    const adminPhone = process.env.ADMIN_PHONE || '';
    if (adminPhone) {
      sendSMS({
        member_id: null,
        name: staff.full_name,
        phone: adminPhone,
        message: `کد بازیابی رمز عبور پنل آلفا: ${code}\nاین کد ۱۰ دقیقه اعتبار دارد.`,
        type: 'password_reset',
      });
    }
  } catch (e) {
    console.error('[FORGOT] SMS send failed:', e);
  }

  // در حالت development، کد رو لاگ کن
  if (ENV === 'development') {
    console.log(`[FORGOT] Password reset code for ${staff.username}: ${code}`);
  }

  res.json({ ok: true, message: 'اگر این نام کاربری وجود دارد، کد بازیابی ارسال خواهد شد' });
});

// تأیید کد و تنظیم رمز جدید
app.post('/auth/reset-password', (req, res) => {
  const { username, code, new_password } = req.body || {};
  if (!username || !code || !new_password) {
    return res.status(400).json({ error: 'نام کاربری، کد و رمز جدید الزامی است' });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد' });
  }

  const staff = db.prepare(`SELECT * FROM staff WHERE username = ? COLLATE NOCASE`).get(String(username).trim());
  if (!staff) {
    return res.status(401).json({ error: 'درخواست نامعتبر است' });
  }

  // پیدا کردن کد معتبر
  const reset = db.prepare(`
    SELECT * FROM password_resets
    WHERE staff_id = ? AND code = ? AND used = 0
    ORDER BY id DESC LIMIT 1
  `).get(staff.id, String(code).trim());

  if (!reset) {
    return res.status(401).json({ error: 'کد بازیابی نامعتبر است' });
  }

  // بررسی انقضا
  const expiresAt = new Date(reset.expires_at).getTime();
  if (expiresAt < Date.now()) {
    return res.status(401).json({ error: 'کد بازیابی منقضی شده است' });
  }

  // استفاده از کد (یک‌بار مصرف)
  db.prepare(`UPDATE password_resets SET used = 1 WHERE id = ?`).run(reset.id);

  // تغییر رمز
  db.prepare(`UPDATE staff SET password_hash = ? WHERE id = ?`)
    .run(hashPassword(String(new_password)), staff.id);

  // حذف تمام نشست‌های قبلی این کاربر
  db.prepare(`DELETE FROM sessions WHERE staff_id = ?`).run(staff.id);

  res.json({ ok: true, message: 'رمز عبور با موفقیت تغییر کرد' });
});

/* =========================
   USERS (مدیریت کاربران — فقط مدیر)
========================= */

app.get('/users', requireAuth, requireAdmin, (_req, res) => {
  const rows = db
    .prepare(`SELECT * FROM staff ORDER BY id`)
    .all();
  res.json(rows.map(publicStaff));
});

app.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, full_name, role } = req.body || {};
  const uname = String(username || '').trim();
  if (!uname) return res.status(400).json({ error: 'نام کاربری الزامی است' });
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
  }
  const normalizedRole = role === 'admin' ? 'admin' : role === 'coach' ? 'coach' : 'staff';
  const dup = db.prepare(`SELECT id FROM staff WHERE username = ? COLLATE NOCASE`).get(uname);
  if (dup) return res.status(409).json({ error: 'این نام کاربری قبلاً ثبت شده است' });
  const ins = db.prepare(
    `INSERT INTO staff (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`
  ).run(
    uname,
    hashPassword(String(password)),
    String(full_name || '').trim() || 'کاربر جدید',
    normalizedRole
  );
  const row = db.prepare(`SELECT * FROM staff WHERE id = ?`).get(ins.lastInsertRowid);
  audit(req, 'user.create', {
    entityType: 'staff',
    entityId: row.id,
    detail: { username: row.username, role: row.role, full_name: row.full_name },
  });
  res.status(201).json(publicStaff(row));
});

app.put('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { full_name, role, is_active, password } = req.body || {};
  const existing = db.prepare(`SELECT * FROM staff WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'کاربر یافت نشد' });

  if (role && role !== existing.role && existing.role === 'admin') {
    const admins = db.prepare(`SELECT COUNT(*) AS c FROM staff WHERE role = 'admin'`).get().c;
    if (admins <= 1) {
      return res.status(400).json({ error: 'حداقل یک مدیر باید در سیستم وجود داشته باشد' });
    }
  }

  const nextRole = role === 'admin' || role === 'coach' || role === 'staff' ? role : existing.role;
  const active = is_active != null ? (is_active ? 1 : 0) : existing.is_active;
  const name = full_name != null ? String(full_name).trim() : existing.full_name;

  if (password != null && password !== '') {
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
    }
    db.prepare(`UPDATE staff SET full_name = ?, role = ?, is_active = ?, password_hash = ? WHERE id = ?`)
      .run(name, nextRole, active, hashPassword(String(password)), id);
    audit(req, 'user.password_reset', {
      entityType: 'staff',
      entityId: id,
      detail: { username: existing.username },
    });
  } else {
    db.prepare(`UPDATE staff SET full_name = ?, role = ?, is_active = ? WHERE id = ?`)
      .run(name, nextRole, active, id);
  }

  if (!active) {
    db.prepare(`DELETE FROM sessions WHERE staff_id = ?`).run(id);
  }

  audit(req, 'user.update', {
    entityType: 'staff',
    entityId: id,
    detail: { full_name: name, role: nextRole, is_active: !!active },
  });
  const row = db.prepare(`SELECT * FROM staff WHERE id = ?`).get(id);
  res.json(publicStaff(row));
});

app.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM staff WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'کاربر یافت نشد' });
  if (existing.id === req.staff.id) {
    return res.status(400).json({ error: 'نمی‌توانید حساب خودتان را حذف کنید' });
  }
  if (existing.role === 'admin') {
    const admins = db.prepare(`SELECT COUNT(*) AS c FROM staff WHERE role = 'admin'`).get().c;
    if (admins <= 1) {
      return res.status(400).json({ error: 'نمی‌توان تنها مدیر سیستم را حذف کرد' });
    }
  }
  db.prepare(`DELETE FROM sessions WHERE staff_id = ?`).run(id);
  db.prepare(`DELETE FROM staff WHERE id = ?`).run(id);
  audit(req, 'user.delete', {
    entityType: 'staff',
    entityId: id,
    detail: { username: existing.username },
  });
  res.json({ ok: true });
});

/* =========================
   AUDIT LOGS (گزارش فعالیت — فقط مدیر)
========================= */

app.get('/audit-logs', requireAuth, requireAdmin, (req, res) => {
  const { actor_id, member_id, entity_type, action, limit } = req.query;
  let query = `SELECT * FROM audit_logs WHERE 1=1`;
  const params = [];
  if (actor_id) { query += ` AND actor_id = ?`; params.push(Number(actor_id)); }
  if (member_id) { query += ` AND member_id = ?`; params.push(Number(member_id)); }
  if (entity_type) { query += ` AND entity_type = ?`; params.push(String(entity_type)); }
  if (action) { query += ` AND action = ?`; params.push(String(action)); }
  query += ` ORDER BY id DESC LIMIT ?`;
  params.push(Math.min(Number(limit) || 200, 500));
  const rows = db.prepare(query).all(...params);
  res.json(rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })));
});

/* =========================
   MEMBERS
========================= */

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

// ✅ فاصله بین ارسال‌های broadcast (جلوگیری از rate-limit کاوه‌نگار)
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const SMS_SEND_DELAY_MS = Number(process.env.SMS_SEND_DELAY_MS) || 400;

// ✅ تبدیل ارقام فارسی/عربی به انگلیسی + نرمال‌سازی تلفن و کد ملی
function faToEnDigits(s) {
  if (s == null) return '';
  return String(s)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function normalizePhone(s) {
  return faToEnDigits(s).replace(/[^\d]/g, '');
}

// ✅ حذف پیشوند «خانم / خانوم» از ابتدای نام و یکپارچه‌سازی فاصله‌ها
function normalizeName(n) {
  return String(n || '')
    .trim()
    .replace(/^(خانم|خانوم)\s+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidNationalId(id) {
  if (!/^\d{10}$/.test(id)) return false;
  if (/^(\d)\1{9}$/.test(id)) return false;
  const digits = id.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  const r = sum % 11;
  return (r < 2 ? r : 11 - r) === digits[9];
}

function nationalIdError(nationalId) {
  if (!nationalId) return 'کد ملی الزامی است';
  if (!isValidNationalId(nationalId)) return 'کد ملی وارد شده معتبر نیست';
  return null;
}

/* =========================
   MEMBER + SPORTS (چندرشته‌ای)
========================= */

function sportsForMember(memberId) {
  return db
    .prepare('SELECT * FROM member_sports WHERE member_id = ? ORDER BY id')
    .all(memberId);
}

// ✅ الحاق آرایه‌ی sports به رکورد عضو + استخراج فیلدهای خلاصه
function attachSports(m, sports) {
  if (!m) return null;
  const list = (sports || []).map((s) => ({
    ...s,
    fee_basis: s.fee_basis || 'monthly',
    class_type: s.class_type || 'group',
  }));
  const expiries = list.map((s) => s.expiry_date || '').filter(Boolean);
  const starts   = list.map((s) => s.start_date || '').filter(Boolean);
  return {
    ...m,
    expiry_date: expiries.length ? expiries.sort().pop() : m.expiry_date || '',
    start_date: starts.length ? starts.sort()[0] : m.start_date || null,
    sport: list.map((s) => s.sport).filter(Boolean).join(' + ') || m.sport || '',
    total_sessions: list.reduce((sum, s) => sum + (Number(s.total_sessions) || 0), 0),
    used_sessions: list.reduce((sum, s) => sum + (Number(s.used_sessions) || 0), 0),
    weekly_sessions: list.reduce((sum, s) => sum + (Number(s.weekly_sessions) || 0), 0),
    tuition_amount: list.reduce((sum, s) => sum + (Number(s.tuition_amount) || 0), 0),
    sports: list,
  };
}

function memberWithSports(id) {
  return attachSports(db.prepare('SELECT * FROM members WHERE id = ?').get(id), sportsForMember(id));
}

// ✅ نرمال‌سازی یک ورودی ورزشی از فرم فرانت (پلن یا سفارشی)
function normalizeSportEntry(s) {
  if (!s) return null;
  const sportName = s.sport != null ? String(s.sport).trim() : '';
  if (!sportName) return null;
  const planKey = s.sport_plan_key ? String(s.sport_plan_key) : null;
  const resolved = resolvePlan(planKey, sportName, s);
  return {
    sport: sportName,
    sport_plan_key: planKey || resolved.plan_key,
    sport_plan_id: resolved.sport_plan_id,
    unit_price: resolved.unit_price,
    weekly_sessions: Number(s.weekly_sessions) || 0,
    total_sessions: Number(s.total_sessions) || resolved.total_sessions,
    used_sessions: Number(s.used_sessions) || 0,
    tuition_amount: s.tuition_amount != null && s.tuition_amount !== '' ? Number(s.tuition_amount) : resolved.tuition_amount,
    fee_basis: s.fee_basis ? String(s.fee_basis).trim() : 'monthly',
    class_type: s.class_type ? String(s.class_type).trim() : (resolved.class_type || 'group'),
    start_date: s.start_date ? String(s.start_date).trim() : null,
    expiry_date: s.expiry_date ? String(s.expiry_date).trim() : null,
  };
}

/**
 * نرخ هر جلسه را از کاتالوگ پلن‌ها استخراج می‌کند.
 *
 * سه مسیر، به‌ترتیب اولویت:
 *  ۱) کلید پلن «رشته::تعداد_جلسه»  → مستقیم‌ترین و دقیق‌ترین
 *  ۲) تطابق رشته + تعداد جلسات     → وقتی کلید ارسال نشده
 *  ۳) قیمت ÷ جلسات از خودِ payload  → وقتی هیچ پلنی در کاتالوگ نیست
 */
function resolvePlan(planKey, sportName, s) {
  const totalSessions = Number(s && s.total_sessions) || 0;
  const tuition = Number(s && s.tuition_amount) || 0;

  const findBy = (sql, ...params) => {
    try { return db.prepare(sql).get(...params) || null; } catch { return null; }
  };

  // ۱) کلید پلن
  if (planKey && planKey !== 'custom') {
    const [keySport, keySessions] = String(planKey).split('::');
    const row = findBy(
      'SELECT id, sessions, price, class_type FROM sport_plans WHERE sport = ? AND sessions = ? AND is_active = 1 LIMIT 1',
      keySport || sportName, Number(keySessions) || 0
    );
    if (row) return planFrom(row, planKey);
  }

  // ۲) تطابق رشته و تعداد جلسات
  if (sportName && totalSessions > 0) {
    const row = findBy(
      'SELECT id, sessions, price, class_type FROM sport_plans WHERE sport = ? AND sessions = ? AND is_active = 1 LIMIT 1',
      sportName, totalSessions
    );
    if (row) return planFrom(row, `${sportName}::${row.sessions}`);
  }

  // ۳) فقط از خودِ payload
  if (tuition > 0 && totalSessions > 0) {
    return { sport_plan_id: null, unit_price: Math.round(tuition / totalSessions), total_sessions: totalSessions, tuition_amount: tuition, class_type: null, plan_key: planKey };
  }
  return { sport_plan_id: null, unit_price: null, total_sessions: totalSessions, tuition_amount: tuition || null, class_type: null, plan_key: planKey };
}

function planFrom(row, planKey) {
  const sessions = Number(row.sessions) || 0;
  const price = Number(row.price) || 0;
  return {
    sport_plan_id: Number(row.id),
    unit_price: sessions > 0 ? Math.round(price / sessions) : null,
    total_sessions: sessions,
    tuition_amount: price || null,
    class_type: row.class_type || null,
    plan_key: planKey,
  };
}

/* =========================
   EXPIRY CHECK
========================= */

function checkExpiredMembers() {
  const today = todayIso();

  const expired = db
    .prepare(`
      SELECT m.id, m.name, m.phone, MIN(ms.expiry_date) AS expiry_date
      FROM member_sports ms
      JOIN members m ON m.id = ms.member_id
      WHERE ms.expiry_date < ?
      GROUP BY m.id
      ORDER BY expiry_date
    `)
    .all(today);

  if (expired.length === 0) {
    console.log(`[cron ${new Date().toISOString()}] No expired members.`);
    return;
  }

  console.log(`[cron ${new Date().toISOString()}] Expired members (${expired.length}):`);

  expired.forEach((m) => {
    console.log(`- ${m.name} (${m.phone})`);
  });
}

// ⚠️ توجه: توابع checkBirthdays و checkExpiryReminders که قبلاً اینجا تعریف
// شده بودند، هیچ‌وقت با cron.schedule صدا زده نمی‌شدند (کد مرده / بلااستفاده).
// منطق واقعی تولد و یادآوری انقضا در services/cronManager.js اجرا می‌شود
// (که توسط startCrons() در پایین همین فایل فعال می‌شود). برای جلوگیری از
// دوباره‌کاری و سردرگمی، این توابع بلااستفاده از اینجا حذف شدند.

/* =========================
   CRON
========================= */

cron.schedule('0 9 * * *', checkExpiredMembers, {
  timezone: 'Asia/Tehran',
});

console.log('Cron scheduled: daily at 09:00');

/* =========================
   HEALTH
========================= */

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

/* =========================
   MEMBERS
========================= */

// ✅ تولید کد عضویت عددی خالص و یکتا (بعداً منطبق با شماره‌ی کاربری دستگاه اسکنر انگشت)
function nextMemberCode() {
  const row = db.prepare('SELECT COALESCE(MAX(CAST(member_code AS INTEGER)), 0) + 1 AS next FROM members').get();
  return Number(row ? row.next : 1);
}

// ✅ تعیین کد عضویت برای یک عضو: اگر تعریف شده و یکتا باشد استفاده می‌شود، وگرنه خودکار تولید می‌شود
function resolveMemberCode(candidate) {
  if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
    const code = String(candidate).trim();
    if (!/^\d{1,15}$/.test(code)) {
      throw new Error('کد عضویت باید عددی و بدون حرف باشد');
    }
    const dup = db.prepare('SELECT member_code FROM members WHERE member_code = ?').get(code);
    if (dup) {
      throw new Error(`کد عضویت ${code} قبلاً استفاده شده است`);
    }
    return code;
  }
  return String(nextMemberCode());
}

// ✅ یافتن مربی فعالِ یک رشته (برای محاسبه سهم مربی در پرداخت‌ها)
function coachForSport(sport) {
  if (!sport) return null;
  return db.prepare(`
    SELECT c.id AS coach_id, cs.commission_percent, cs.commission_amount
    FROM coach_sports cs
    JOIN coaches c ON c.id = cs.coach_id
    WHERE cs.sport = ? AND c.is_active = 1
    ORDER BY cs.id LIMIT 1
  `).get(sport) || null;
}

// ✅ ثبت یک پرداخت (ثبت عضویت / تمدید / دستی) با محاسبه سهم مربی
function recordPayment({ member_id, member_name, sport, amount, type = 'renewal', method = 'cash', note, received_by, coach_id, coach_share, created_at }) {
  const amt = Math.max(0, Number(amount) || 0);
  if (!amt) return null;
  let share = 0;
  let coach = null;
  if (coach_id != null) {
    coach = { coach_id: Number(coach_id) };
  } else if (sport) {
    coach = coachForSport(String(sport));
  }
  if (coach && coach.coach_id) {
    share = coach_share != null
      ? Math.max(0, Number(coach_share) || 0)
      : (coach.commission_amount != null && coach.commission_amount > 0
        ? Number(coach.commission_amount)
        : Math.round((amt * (coach.commission_percent || 0)) / 100));
  }
  const res = db.prepare(`
    INSERT INTO payments (member_id, member_name, sport, coach_id, coach_share, amount, type, method, note, received_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    member_id != null ? Number(member_id) : null,
    member_name ? String(member_name) : null,
    sport ? String(sport) : null,
    coach && coach.coach_id ? Number(coach.coach_id) : null,
    share,
    amt,
    type,
    method,
    note ? String(note) : null,
    received_by ? String(received_by) : null,
    created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
  );
  return { id: res.lastInsertRowid, coach_id: coach && coach.coach_id ? Number(coach.coach_id) : null, coach_share: share };
}

app.get('/members', requireAuth, (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM members ORDER BY id DESC').all();
    const allSports = db.prepare('SELECT * FROM member_sports ORDER BY member_id, id').all();
    const grouped = {};
    for (const s of allSports) {
      (grouped[s.member_id] ||= []).push(s);
    }
    res.json(rows.map((m) => attachSports(m, grouped[m.id] || [])));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

app.post('/members', requireAuth, (req, res) => {
  const {
    name, phone, birthday, national_id, referrer, has_insurance, notes,
    membership_type, sports, goal, member_code,
    // ⬇️ فیلدهای تخت قدیمی (فقط برای سازگاری با فرانت‌های قدیمی)
    expiry_date, start_date,
  } = req.body || {};

  if (!name || !phone) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const normalizedPhone = normalizePhone(phone);
  if (!/^09\d{9}$/.test(normalizedPhone)) {
    return res.status(400).json({ error: 'شماره تلفن باید با ۰۹ شروع شده و ۱۱ رقم باشد' });
  }
  if (!birthday) {
    return res.status(400).json({ error: 'تاریخ تولد الزامی است' });
  }
  const normalizedNat = normalizePhone(national_id);
  const natError = nationalIdError(normalizedNat);
  if (natError) {
    return res.status(400).json({ error: natError });
  }

  const dupPhone = db.prepare('SELECT id, name FROM members WHERE phone = ?').get(normalizedPhone);
  if (dupPhone) {
    return res.status(409).json({ error: `شماره تلفن قبلاً برای «${dupPhone.name}» ثبت شده است` });
  }
  const dupNat = db.prepare('SELECT id, name FROM members WHERE national_id = ?').get(normalizedNat);
  if (dupNat) {
    return res.status(409).json({ error: `کد ملی قبلاً برای «${dupNat.name}» ثبت شده است` });
  }

  // ✅ ساخت لیست اشتراک‌های ورزشی
  let entries = [];
  if (Array.isArray(sports) && sports.length > 0) {
    entries = sports.map(normalizeSportEntry).filter(Boolean);
  } else if (expiry_date) {
    // سازگاری با payload قدیمی تک‌رشته‌ای
    entries = [normalizeSportEntry({
      sport: req.body.sport || '',
      sport_plan_key: req.body.sport_plan_key || null,
      weekly_sessions: req.body.weekly_sessions,
      total_sessions: req.body.total_sessions,
      used_sessions: req.body.used_sessions,
      tuition_amount: req.body.tuition_amount,
      fee_basis: req.body.fee_basis,
      class_type: req.body.class_type,
      start_date: req.body.start_date,
      expiry_date,
    })];
  }

  if (entries.length === 0) {
    return res.status(400).json({ error: 'حداقل یک رشته ورزشی الزامی است' });
  }

  const derivedExpiry = entries
    .map((e) => e.expiry_date)
    .filter(Boolean)
    .sort()
    .pop() || expiry_date || null;
  const derivedStart = entries
    .map((e) => e.start_date)
    .filter(Boolean)
    .sort()
    .shift() || start_date || null;

  try {
    const resolvedCode = resolveMemberCode(member_code);

    const insertMember = db.prepare(`
      INSERT INTO members (name, phone, birthday, national_id, referrer, has_insurance, notes, membership_type, start_date, expiry_date, goal, member_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSport = db.prepare(`
      INSERT INTO member_sports
        (member_id, sport, sport_plan_key, sport_plan_id, unit_price, weekly_sessions, total_sessions,
         used_sessions, tuition_amount, fee_basis, class_type, start_date, expiry_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const createMember = db.transaction(() => {
      const memberRes = insertMember.run(
        normalizeName(name),
        normalizedPhone,
        birthday ? String(birthday).trim() : null,
        normalizedNat,
        referrer ? String(referrer).trim() : null,
        has_insurance ? 1 : 0,
        notes ? String(notes).trim() : null,
        membership_type ? String(membership_type).trim() : 'monthly',
        derivedStart,
        derivedExpiry,
        goal ? String(goal).trim() : null,
        resolvedCode
      );
      const memberId = memberRes.lastInsertRowid;
      for (const e of entries) {
        insertSport.run(
          memberId,
          e.sport,
          e.sport_plan_key,
          e.sport_plan_id != null ? Number(e.sport_plan_id) : null,
          e.unit_price != null ? Number(e.unit_price) : null,
          e.weekly_sessions,
          e.total_sessions,
          e.used_sessions,
          e.tuition_amount,
          e.fee_basis,
          e.class_type,
          e.start_date || start_date || null,
          e.expiry_date || expiry_date || null
        );
      }
      return memberId;
    });

    const memberId = createMember();
    const actor = req.staff ? req.staff.full_name : 'سیستم';
    db.prepare(`UPDATE members SET created_by = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(actor, actor, memberId);

    // 💰 ثبت پرداخت ثبت‌نام (درآمد)
    const totalTuition = entries.reduce((s, e) => s + (Number(e.tuition_amount) || 0), 0);
    const primarySport = entries.map((e) => e.sport).filter(Boolean).join('، ') || null;
    recordPayment({
      member_id: memberId,
      member_name: normalizeName(name),
      sport: primarySport,
      amount: totalTuition,
      type: 'registration',
      received_by: actor,
    });

    const row = memberWithSports(memberId);

    // 🔥 EVENT SYSTEM
    onMemberCreated(row);

    audit(req, 'member.create', {
      entityType: 'member',
      entityId: memberId,
      memberId,
      detail: { name: row.name, phone: row.phone, sports: (row.sports || []).map((s) => s.sport) },
    });

    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    if (err && err.message && /کد عضویت/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create member' });
  }
});

app.put('/members/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);

  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);

  if (!existing) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const {
    name, phone, birthday, national_id, referrer, has_insurance, notes, membership_type,
    sports, goal, member_code,
    // ⬇️ فیلدهای تخت قدیمی (مسیر سازگاری: تمدید/بروزرسانی از صفحات قدیمی)
    expiry_date, start_date,
  } = req.body || {};

  // ✅ اعتبارسنجی فقط برای فیلدهایی که در این درخواست ارسال و تغییر کرده‌اند
  if (phone != null && String(phone).trim() !== String(existing.phone).trim()) {
    const normalizedPhone = normalizePhone(phone);
    if (!/^09\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: 'شماره تلفن باید با ۰۹ شروع شده و ۱۱ رقم باشد' });
    }
    const dup = db.prepare('SELECT id, name FROM members WHERE phone = ? AND id != ?').get(normalizedPhone, id);
    if (dup) {
      return res.status(409).json({ error: `شماره تلفن قبلاً برای «${dup.name}» ثبت شده است` });
    }
  }
  if (national_id != null && String(national_id).trim() !== String(existing.national_id || '').trim()) {
    const normalizedNat = normalizePhone(national_id);
    const natError = nationalIdError(normalizedNat);
    if (natError) {
      return res.status(400).json({ error: natError });
    }
    const dup = db.prepare('SELECT id, name FROM members WHERE national_id = ? AND id != ?').get(normalizedNat, id);
    if (dup) {
      return res.status(409).json({ error: `کد ملی قبلاً برای «${dup.name}» ثبت شده است` });
    }
  }
  if (birthday != null && !String(birthday).trim()) {
    return res.status(400).json({ error: 'تاریخ تولد الزامی است' });
  }

  let resolvedCode = existing.member_code;
  if (member_code !== undefined && member_code !== null && String(member_code).trim() !== '') {
    const code = String(member_code).trim();
    if (!/^\d{1,15}$/.test(code)) {
      return res.status(400).json({ error: 'کد عضویت باید عددی و بدون حرف باشد' });
    }
    const dup = db.prepare('SELECT id FROM members WHERE member_code = ? AND id != ?').get(code, id);
    if (dup) {
      return res.status(400).json({ error: `کد عضویت ${code} قبلاً استفاده شده است` });
    }
    resolvedCode = code;
  }

  try {
    const updateMember = db.prepare(`
      UPDATE members SET
        name = ?,
        phone = ?,
        birthday = ?,
        national_id = ?,
        referrer = ?,
        has_insurance = ?,
        notes = ?,
        membership_type = ?,
        goal = ?,
        member_code = ?
      WHERE id = ?
    `).run(
      name != null ? normalizeName(name) : existing.name,
      phone != null ? normalizePhone(phone) : existing.phone,
      birthday != null ? String(birthday).trim() : existing.birthday,
      national_id != null ? normalizePhone(national_id) : existing.national_id,
      referrer != null ? String(referrer).trim() : existing.referrer,
      has_insurance != null ? (has_insurance ? 1 : 0) : existing.has_insurance,
      notes != null ? String(notes).trim() : existing.notes,
      membership_type != null ? String(membership_type).trim() : existing.membership_type,
      goal != null ? String(goal).trim() : existing.goal,
      resolvedCode,
      id
    );

    if (Array.isArray(sports)) {
      // ✅ حالت جدید: جایگزینی کامل اشتراک‌های ورزشی
      const entries = sports.map(normalizeSportEntry).filter(Boolean);
      if (entries.length === 0) {
        return res.status(400).json({ error: 'حداقل یک رشته ورزشی الزامی است' });
      }
      const deleteSports = db.prepare('DELETE FROM member_sports WHERE member_id = ?');
      const insertSport = db.prepare(`
        INSERT INTO member_sports
          (member_id, sport, sport_plan_key, sport_plan_id, unit_price, weekly_sessions, total_sessions,
           used_sessions, tuition_amount, fee_basis, class_type, start_date, expiry_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const replaceSports = db.transaction(() => {
        deleteSports.run(id);
        for (const e of entries) {
          insertSport.run(
            id,
            e.sport,
            e.sport_plan_key,
            e.sport_plan_id != null ? Number(e.sport_plan_id) : null,
            e.unit_price != null ? Number(e.unit_price) : null,
            e.weekly_sessions,
            e.total_sessions,
            e.used_sessions,
            e.tuition_amount,
            e.fee_basis,
            e.class_type,
            e.start_date || start_date || existing.start_date,
            e.expiry_date || expiry_date || existing.expiry_date
          );
        }
      });
      replaceSports();
      const derivedExpiry = entries
        .map((e) => e.expiry_date)
        .filter(Boolean)
        .sort()
        .pop() || expiry_date || existing.expiry_date;
      const derivedStart = entries
        .map((e) => e.start_date)
        .filter(Boolean)
        .sort()
        .shift() || start_date || existing.start_date;
      db.prepare('UPDATE members SET start_date = ?, expiry_date = ? WHERE id = ?')
        .run(derivedStart, derivedExpiry, id);
    } else if (expiry_date != null) {
      // ✅ مسیر سازگاری (تمدید سریع صفحات قدیمی): تمدید همه‌ی رشته‌های عضو
      db.prepare('UPDATE member_sports SET expiry_date = ? WHERE member_id = ?')
        .run(String(expiry_date).trim(), id);
      db.prepare('UPDATE members SET expiry_date = ? WHERE id = ?')
        .run(String(expiry_date).trim(), id);
    }

    const actor = req.staff ? req.staff.full_name : 'سیستم';
    db.prepare(`UPDATE members SET updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(actor, id);
    const row = memberWithSports(id);
    audit(req, 'member.update', {
      entityType: 'member',
      entityId: id,
      memberId: id,
      detail: { name: row.name, phone: row.phone, sports: (row.sports || []).map((s) => s.sport) },
    });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

app.delete('/members/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);

  try {
    const existing = db.prepare('SELECT id, name, phone FROM members WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Member not found' });
    }
    db.prepare('DELETE FROM member_sports WHERE member_id = ?').run(id);
    const result = db.prepare('DELETE FROM members WHERE id = ?').run(id);
    audit(req, 'member.delete', {
      entityType: 'member',
      entityId: id,
      memberId: id,
      detail: { name: existing.name, phone: existing.phone },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

// ✅ تاریخچه فعالیت یک عضو خاص
app.get('/members/:id/audit', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  try {
    const rows = db
      .prepare('SELECT * FROM audit_logs WHERE member_id = ? ORDER BY id DESC LIMIT 50')
      .all(id);
    res.json(rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch member audit' });
  }
});

/* =========================
   SMS LOGS
========================= */
app.get('/sms-logs', requireAuth, (req, res) => {
  try {
    const { phone, member_id } = req.query;

    let query = 'SELECT * FROM sms_logs WHERE 1=1';
    const params = [];

    if (phone) {
      query += ' AND phone LIKE ?';
      params.push(`%${phone}%`);
    }

    if (member_id) {
      query += ' AND member_id = ?';
      params.push(Number(member_id));
    }

    query += ' ORDER BY id DESC';

    const rows = db.prepare(query).all(...params);

    res.json(rows);
  } catch (err) {
    console.error('GET /sms-logs', err);
    res.status(500).json({ error: 'Failed to fetch sms logs' });
  }
});

/* =========================
   SMS SEND
========================= */
app.post('/sms/send', requireAuth, async (req, res) => {
  const { member_id, name, phone, message } = req.body || {};

  if (!phone || !String(phone).trim()) {
    return res.status(400).json({ error: 'phone is required' });
  }
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const normalizedPhone = String(phone).trim();
    const normalizedMessage = String(message).trim();

    // ✅ FIX: قبلاً "status: 'mock'" اینجا هاردکد شده بود و صرف‌نظر از نتیجه‌ی
    // واقعی ارسال، همیشه در دیتابیس mock ثبت می‌شد. الان status از روی نتیجه‌ی
    // واقعی ارسال به کاوه‌نگار در خود smsService.js محاسبه می‌شود.
    const ok = await sendSMS({
      member_id: member_id != null ? Number(member_id) : null,
      name: name != null ? String(name).trim() : '',
      phone: normalizedPhone,
      message: normalizedMessage,
    });

    const log = db.prepare('SELECT * FROM sms_logs ORDER BY id DESC LIMIT 1').get();

    audit(req, 'sms.send', {
      entityType: 'sms_log',
      entityId: log ? log.id : null,
      memberId: member_id != null ? Number(member_id) : null,
      detail: { phone: normalizedPhone },
    });

    if (!ok) {
      return res.status(500).json({
        success: false,
        error: 'Failed to send SMS',
        log: log || null,
      });
    }

    res.status(201).json({
      success: true,
      log,
    });
  } catch (err) {
    console.error('POST /sms/send', err);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

/* =========================
   SMS BROADCAST
========================= */
app.post('/sms/broadcast', requireAuth, async (req, res) => {
  const { recipients, message } = req.body || {};

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recipients array is required' });
  }
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const normalizedMessage = String(message).trim();
  let successCount = 0;
  let failureCount = 0;
  const details = [];

  for (const recipient of recipients) {
    const phone = recipient?.phone ? String(recipient.phone).trim() : '';
    if (!phone) {
      failureCount += 1;
      details.push({
        member_id: recipient?.member_id ?? null,
        phone: '',
        success: false,
        error: 'missing phone',
      });
      continue;
    }

    try {
      // ✅ FIX: status:'mock' هاردکد حذف شد + await اضافه شد
      const ok = await sendSMS({
        member_id: recipient.member_id != null ? Number(recipient.member_id) : null,
        name: recipient.name != null ? String(recipient.name).trim() : '',
        phone,
        message: normalizedMessage,
      });

      if (ok) {
        successCount += 1;
        details.push({ member_id: recipient.member_id, phone, success: true });
      } else {
        failureCount += 1;
        details.push({ member_id: recipient.member_id, phone, success: false, error: 'send failed' });
      }
    } catch (err) {
      failureCount += 1;
      details.push({
        member_id: recipient.member_id,
        phone,
        success: false,
        error: err instanceof Error ? err.message : 'unknown error',
      });
    }

    await delay(SMS_SEND_DELAY_MS); // ✅ فاصله بین ارسال‌ها
  }

  // ✅ لاگ خلاصه
  console.log(`[SMS BROADCAST SUMMARY] total=${recipients.length} success=${successCount} failed=${failureCount}`);

  audit(req, 'sms.broadcast', {
    entityType: 'sms_log',
    detail: { total: recipients.length, success_count: successCount, failure_count: failureCount },
  });

  res.json({
    success_count: successCount,
    failure_count: failureCount,
    total: recipients.length,
    details,
  });
});

/* =========================
   RENEWALS
========================= */
app.get('/renewals', requireAuth, (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT r.*, m.name AS member_name, m.phone AS member_phone
      FROM renewals r
      LEFT JOIN members m ON m.id = r.member_id
      ORDER BY r.id DESC
    `).all();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list renewals' });
  }
});

app.post('/renewals', requireAuth, (req, res) => {
  const {
    member_id, sport_id, membership_type, old_end_date, new_end_date, amount, status, renewed_by,
  } = req.body || {};

  if (!member_id) {
    return res.status(400).json({ error: 'member_id is required' });
  }

  try {
    const actor = req.staff ? req.staff.full_name : (renewed_by ? String(renewed_by).trim() : null);
    const result = db
      .prepare(`
        INSERT INTO renewals (member_id, sport_id, membership_type, old_end_date, new_end_date, amount, status, renewed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        Number(member_id),
        sport_id != null ? Number(sport_id) : null,
        membership_type ? String(membership_type).trim() : 'monthly',
        old_end_date ? String(old_end_date).trim() : null,
        new_end_date ? String(new_end_date).trim() : null,
        amount != null && amount !== '' ? Number(amount) : 0,
        status ? String(status).trim() : 'completed',
        actor
      );

    const row = db.prepare('SELECT * FROM renewals WHERE id = ?').get(result.lastInsertRowid);

    // 💰 ثبت پرداخت تمدید (درآمد)
    if (Number(row.amount) > 0) {
      const member = db.prepare('SELECT name FROM members WHERE id = ?').get(Number(member_id));
      const sportInfo = sport_id != null
        ? db.prepare('SELECT sport FROM member_sports WHERE id = ?').get(Number(sport_id))
        : null;
      recordPayment({
        member_id: Number(member_id),
        member_name: member ? member.name : null,
        sport: sportInfo ? sportInfo.sport : null,
        amount: row.amount,
        type: 'renewal',
        received_by: actor,
      });
    }

    audit(req, 'renewal.create', {
      entityType: 'renewal',
      entityId: row.id,
      memberId: Number(member_id),
      detail: {
        amount: row.amount,
        old_end_date: row.old_end_date,
        new_end_date: row.new_end_date,
        sport_id: row.sport_id,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create renewal' });
  }
});

app.patch('/renewals/:id/status', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};

  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }

  try {
    const result = db
      .prepare('UPDATE renewals SET status = ? WHERE id = ?')
      .run(String(status).trim(), id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Renewal not found' });
    }

    const row = db.prepare('SELECT * FROM renewals WHERE id = ?').get(id);
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update renewal' });
  }
});

/* =========================
   EXCEL EXPORT
========================= */
app.get('/members/export/meta', requireAuth, (_req, res) => {
  try {
    const file = latestExportPath();
    if (!file) {
      return res.status(404).json({ error: 'No export available yet' });
    }
    const stat = fs.statSync(file);
    res.json({
      filename: path.basename(file),
      updated_at: stat.mtime.toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read export meta' });
  }
});

app.get('/members/export', requireAuth, (_req, res) => {
  try {
    let file = latestExportPath();
    if (!file) {
      generateMembersExcel();
      file = latestExportPath();
    }
    if (!file) {
      return res.status(500).json({ error: 'Export not available' });
    }
    res.download(file, path.basename(file));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export members' });
  }
});

/* =========================
   ACCOUNTING (حسابداری)
========================= */

// ✅ بازه زمانی پیش‌فرض: ماه جاری
function periodBounds(from, to) {
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = today.slice(0, 8) + '01';
  return {
    f: from ? String(from).slice(0, 10) : firstDay,
    t: to ? String(to).slice(0, 10) : today,
  };
}

function sendCsv(res, filename, headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = '\uFEFF' + [
    headers.map(esc).join(','),
    ...rows.map((r) => r.map(esc).join(',')),
  ].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

const accountingGuards = [requireAuth, requireAdmin, requireFeature('accounting')];

// 📊 خلاصه مالی
app.get('/accounting/summary', accountingGuards, (req, res) => {
  try {
    const { f, t } = periodBounds(req.query.from, req.query.to);
    const pay = db.prepare(`
      SELECT COALESCE(SUM(amount),0) AS total, COALESCE(SUM(coach_share),0) AS coach_share, COUNT(*) AS count
      FROM payments WHERE substr(created_at,1,10) BETWEEN ? AND ?
    `).get(f, t);
    const exp = db.prepare(`
      SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
      FROM expenses WHERE date BETWEEN ? AND ?
    `).get(f, t);
    const byType = db.prepare(`
      SELECT type, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
      FROM payments WHERE substr(created_at,1,10) BETWEEN ? AND ?
      GROUP BY type
    `).all(f, t);
    const bySport = db.prepare(`
      SELECT sport, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
      FROM payments
      WHERE substr(created_at,1,10) BETWEEN ? AND ? AND sport IS NOT NULL AND sport != ''
      GROUP BY sport ORDER BY total DESC
    `).all(f, t);
    const today = db.prepare(`
      SELECT COALESCE(SUM(amount),0) AS total FROM payments
      WHERE substr(created_at,1,10) = date('now')
    `).get();
    const income = Number(pay.total) || 0;
    const expenses = Number(exp.total) || 0;
    const coachShare = Number(pay.coach_share) || 0;
    res.json({
      from: f,
      to: t,
      income_total: income,
      income_today: Number(today.total) || 0,
      expenses_total: expenses,
      coach_shares_total: coachShare,
      net: income - expenses - coachShare,
      payments_count: Number(pay.count) || 0,
      expenses_count: Number(exp.count) || 0,
      by_type: byType,
      top_sports: bySport,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load summary' });
  }
});

// 💳 فهرست پرداخت‌ها
app.get('/accounting/payments', accountingGuards, (req, res) => {
  try {
    const { f, t } = periodBounds(req.query.from, req.query.to);
    const where = ['substr(created_at,1,10) BETWEEN ? AND ?'];
    const params = [f, t];
    for (const [col, val] of [['type', req.query.type], ['method', req.query.method], ['sport', req.query.sport]]) {
      if (val) {
        where.push(`${col} = ?`);
        params.push(String(val));
      }
    }
    if (req.query.q) {
      where.push('(member_name LIKE ? OR CAST(member_id AS TEXT) = ?)');
      params.push(`%${String(req.query.q).trim()}%`, String(req.query.q).trim());
    }
    const whereSql = where.join(' AND ');
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const rows = db.prepare(`SELECT * FROM payments WHERE ${whereSql} ORDER BY id DESC LIMIT ?`).all(...params, limit);
    const agg = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM payments WHERE ${whereSql}`).get(...params);
    res.json({ rows, total: Number(agg.total) || 0, count: Number(agg.count) || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list payments' });
  }
});

// ➕ ثبت پرداخت دستی
app.post('/accounting/payments', accountingGuards, (req, res) => {
  try {
    const { member_id, member_name, amount, type, method, sport, note, date } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ error: 'مبلغ پرداخت باید بزرگ‌تر از صفر باشد' });
    }
    const member = member_id ? db.prepare('SELECT id, name FROM members WHERE id = ?').get(Number(member_id)) : null;
    const created = recordPayment({
      member_id: member ? member.id : (member_id != null && member_id !== '' ? Number(member_id) : null),
      member_name: member ? member.name : (member_name ? String(member_name).trim() : null),
      sport: sport ? String(sport).trim() : null,
      amount: amt,
      type: ['registration', 'renewal', 'manual', 'fee', 'other'].includes(String(type)) ? String(type) : 'manual',
      method: ['cash', 'card', 'transfer', 'pos', 'other'].includes(String(method)) ? String(method) : 'cash',
      note: note ? String(note).trim() : null,
      received_by: req.staff.full_name,
      created_at: date ? `${String(date).slice(0, 10)} ${new Date().toISOString().slice(11, 19)}` : undefined,
    });
    audit(req, 'accounting.payment', {
      entityType: 'payment',
      entityId: created.id,
      memberId: member ? member.id : null,
      detail: { amount: amt, type: String(type || 'manual'), sport: sport || null },
    });
    res.status(201).json(db.prepare('SELECT * FROM payments WHERE id = ?').get(created.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// 🗑️ حذف پرداخت
app.delete('/accounting/payments/:id', accountingGuards, (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'پرداخت پیدا نشد' });
    db.prepare('DELETE FROM payments WHERE id = ?').run(id);
    audit(req, 'accounting.payment_delete', {
      entityType: 'payment',
      entityId: id,
      memberId: row.member_id,
      detail: { amount: row.amount },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

// 👨‍🏫 مربی‌ها
app.get('/accounting/coaches', accountingGuards, (_req, res) => {
  try {
    const coaches = db.prepare('SELECT * FROM coaches ORDER BY id DESC').all();
    const sports = db.prepare('SELECT * FROM coach_sports').all();
    const grouped = {};
    for (const s of sports) (grouped[s.coach_id] ||= []).push(s);
    res.json(coaches.map((c) => ({ ...c, sports: grouped[c.id] || [] })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list coaches' });
  }
});

app.post('/accounting/coaches', accountingGuards, (req, res) => {
  try {
    const { name, phone, is_active, sports } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'نام مربی الزامی است' });
    }
    const insert = db.transaction(() => {
      const r = db.prepare('INSERT INTO coaches (name, phone, is_active) VALUES (?, ?, ?)')
        .run(String(name).trim(), phone ? String(phone).trim() : null, is_active ? 1 : 0);
      const id = r.lastInsertRowid;
      if (Array.isArray(sports)) {
        for (const s of sports) {
          if (s && s.sport && String(s.sport).trim()) {
            db.prepare('INSERT INTO coach_sports (coach_id, sport, commission_percent, commission_amount) VALUES (?, ?, ?, ?)')
              .run(id, String(s.sport).trim(), Number(s.commission_percent) || 0, s.commission_amount != null && s.commission_amount !== '' ? Number(s.commission_amount) : null);
          }
        }
      }
      return id;
    });
    const id = insert();
    audit(req, 'accounting.coach', { entityType: 'coach', entityId: id, detail: { name: String(name).trim() } });
    const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(id);
    const sportRows = db.prepare('SELECT * FROM coach_sports WHERE coach_id = ?').all(id);
    res.status(201).json({ ...coach, sports: sportRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create coach' });
  }
});

app.put('/accounting/coaches/:id', accountingGuards, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM coaches WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'مربی پیدا نشد' });
    const { name, phone, is_active, sports } = req.body || {};
    db.prepare('UPDATE coaches SET name = ?, phone = ?, is_active = ? WHERE id = ?')
      .run(name ? String(name).trim() : existing.name, phone != null ? String(phone).trim() : existing.phone, is_active ? 1 : 0, id);
    db.prepare('DELETE FROM coach_sports WHERE coach_id = ?').run(id);
    if (Array.isArray(sports)) {
      for (const s of sports) {
        if (s && s.sport && String(s.sport).trim()) {
          db.prepare('INSERT INTO coach_sports (coach_id, sport, commission_percent, commission_amount) VALUES (?, ?, ?, ?)')
            .run(id, String(s.sport).trim(), Number(s.commission_percent) || 0, s.commission_amount != null && s.commission_amount !== '' ? Number(s.commission_amount) : null);
        }
      }
    }
    audit(req, 'accounting.coach_update', { entityType: 'coach', entityId: id, detail: { name: String(name || existing.name).trim() } });
    const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(id);
    const sportsRows = db.prepare('SELECT * FROM coach_sports WHERE coach_id = ?').all(id);
    res.json({ ...coach, sports: sportsRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update coach' });
  }
});

app.delete('/accounting/coaches/:id', accountingGuards, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM coaches WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'مربی پیدا نشد' });
    db.prepare('UPDATE coaches SET is_active = 0 WHERE id = ?').run(id);
    audit(req, 'accounting.coach_delete', { entityType: 'coach', entityId: id, detail: { name: existing.name } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete coach' });
  }
});

// 📈 گزارش سهم مربی
app.get('/accounting/coach-report', accountingGuards, (req, res) => {
  try {
    const { f, t } = periodBounds(req.query.from, req.query.to);
    const period = f.slice(0, 7);
    const coaches = db.prepare('SELECT * FROM coaches WHERE is_active = 1 ORDER BY id DESC').all();
    const rows = coaches.map((c) => {
      const inc = db.prepare(`
        SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
        FROM payments WHERE coach_id = ? AND substr(created_at,1,10) BETWEEN ? AND ?
      `).get(c.id, f, t);
      const share = db.prepare(`
        SELECT COALESCE(SUM(coach_share),0) AS total
        FROM payments WHERE coach_id = ? AND substr(created_at,1,10) BETWEEN ? AND ?
      `).get(c.id, f, t);
      const settled = db.prepare(`
        SELECT COALESCE(SUM(amount),0) AS total
        FROM coach_settlements WHERE coach_id = ? AND period = ?
      `).get(c.id, period);
      const sports = db.prepare('SELECT sport, commission_percent, commission_amount FROM coach_sports WHERE coach_id = ?').all(c.id);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        sports,
        income: Number(inc.total) || 0,
        payments_count: Number(inc.count) || 0,
        share: Number(share.total) || 0,
        settled: Number(settled.total) || 0,
        remaining: (Number(share.total) || 0) - (Number(settled.total) || 0),
        period,
      };
    });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load coach report' });
  }
});

// 🤝 تسویه مربی
app.post('/accounting/coaches/:id/settle', accountingGuards, (req, res) => {
  try {
    const id = Number(req.params.id);
    const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(id);
    if (!coach) return res.status(404).json({ error: 'مربی پیدا نشد' });
    const { period, amount, note } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ error: 'مبلغ تسویه باید بزرگ‌تر از صفر باشد' });
    }
    const p = period ? String(period).slice(0, 7) : new Date().toISOString().slice(0, 7);
    const r = db.prepare('INSERT INTO coach_settlements (coach_id, period, amount, note, settled_by) VALUES (?, ?, ?, ?, ?)')
      .run(id, p, amt, note ? String(note).trim() : null, req.staff.full_name);
    audit(req, 'accounting.coach_settle', {
      entityType: 'coach',
      entityId: id,
      detail: { period: p, amount: amt },
    });
    res.status(201).json(db.prepare('SELECT * FROM coach_settlements WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to settle coach' });
  }
});

// 💸 هزینه‌ها
app.get('/accounting/expenses', accountingGuards, (req, res) => {
  try {
    const { f, t } = periodBounds(req.query.from, req.query.to);
    const where = ['date BETWEEN ? AND ?'];
    const params = [f, t];
    if (req.query.category) {
      where.push('category = ?');
      params.push(String(req.query.category));
    }
    const whereSql = where.join(' AND ');
    const rows = db.prepare(`SELECT * FROM expenses WHERE ${whereSql} ORDER BY id DESC`).all(...params);
    const agg = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM expenses WHERE ${whereSql}`).get(...params);
    const categories = db.prepare('SELECT category, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC').all(f, t);
    res.json({ rows, total: Number(agg.total) || 0, count: Number(agg.count) || 0, categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list expenses' });
  }
});

app.post('/accounting/expenses', accountingGuards, (req, res) => {
  try {
    const { title, amount, category, date, note } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'عنوان هزینه الزامی است' });
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ error: 'مبلغ هزینه باید بزرگ‌تر از صفر باشد' });
    }
    const r = db.prepare('INSERT INTO expenses (title, amount, category, date, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        String(title).trim(),
        amt,
        category ? String(category).trim() : 'عمومی',
        date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        note ? String(note).trim() : null,
        req.staff.full_name
      );
    audit(req, 'accounting.expense', { entityType: 'expense', entityId: r.lastInsertRowid, detail: { title: String(title).trim(), amount: amt } });
    res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

app.put('/accounting/expenses/:id', accountingGuards, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'هزینه پیدا نشد' });
    const { title, amount, category, date, note } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ error: 'مبلغ هزینه باید بزرگ‌تر از صفر باشد' });
    }
    db.prepare('UPDATE expenses SET title = ?, amount = ?, category = ?, date = ?, note = ? WHERE id = ?')
      .run(
        title ? String(title).trim() : existing.title,
        amt,
        category ? String(category).trim() : existing.category,
        date ? String(date).slice(0, 10) : existing.date,
        note != null ? String(note).trim() : existing.note,
        id
      );
    audit(req, 'accounting.expense_update', { entityType: 'expense', entityId: id, detail: { title: String(title || existing.title).trim(), amount: amt } });
    res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

app.delete('/accounting/expenses/:id', accountingGuards, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'هزینه پیدا نشد' });
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    audit(req, 'accounting.expense_delete', { entityType: 'expense', entityId: id, detail: { title: existing.title } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// 🔄 گردش حساب یک عضو
app.get('/accounting/member/:id/ledger', accountingGuards, (req, res) => {
  try {
    const id = Number(req.params.id);
    const member = db.prepare('SELECT id, name, phone FROM members WHERE id = ?').get(id);
    if (!member) return res.status(404).json({ error: 'عضو پیدا نشد' });
    const payments = db.prepare('SELECT * FROM payments WHERE member_id = ? ORDER BY id DESC').all(id);
    const renewals = db.prepare(`
      SELECT r.id, r.amount, r.status, r.old_end_date, r.new_end_date, r.membership_type, r.created_at
      FROM renewals r WHERE r.member_id = ? ORDER BY r.id DESC
    `).all(id);
    const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    res.json({ member, payments, renewals, total_paid: totalPaid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load member ledger' });
  }
});

// 📤 خروجی CSV پرداخت‌ها
app.get('/accounting/export/payments.csv', accountingGuards, (req, res) => {
  try {
    const { f, t } = periodBounds(req.query.from, req.query.to);
    const where = ['substr(created_at,1,10) BETWEEN ? AND ?'];
    const params = [f, t];
    for (const [col, val] of [['type', req.query.type], ['method', req.query.method], ['sport', req.query.sport]]) {
      if (val) {
        where.push(`${col} = ?`);
        params.push(String(val));
      }
    }
    const rows = db.prepare(`SELECT * FROM payments WHERE ${where.join(' AND ')} ORDER BY id DESC`).all(...params);
    const fa = new Intl.NumberFormat('fa-IR');
    const typeLabel = { registration: 'ثبت‌نام', renewal: 'تمدید', manual: 'دستی', fee: 'شهریه', other: 'سایر' };
    const methodLabel = { cash: 'نقدی', card: 'کارت', transfer: 'کارت‌به‌کارت', pos: 'پوز', other: 'سایر' };
    sendCsv(res, `payments_${f}_${t}.csv`, ['شناسه', 'عضو', 'رشته', 'مبلغ', 'سهم مربی', 'نوع', 'روش', 'توضیح', 'گیرنده', 'تاریخ'], rows.map((p) => [
      p.id,
      p.member_name || '',
      p.sport || '',
      fa.format(p.amount || 0),
      fa.format(p.coach_share || 0),
      typeLabel[p.type] || p.type || '',
      methodLabel[p.method] || p.method || '',
      p.note || '',
      p.received_by || '',
      String(p.created_at || '').slice(0, 10),
    ]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export payments' });
  }
});

// 📤 خروجی CSV گزارش مربی‌ها
app.get('/accounting/export/coach-report.csv', accountingGuards, (req, res) => {
  try {
    const { f, t } = periodBounds(req.query.from, req.query.to);
    const period = f.slice(0, 7);
    const coaches = db.prepare('SELECT * FROM coaches WHERE is_active = 1 ORDER BY id DESC').all();
    const fa = new Intl.NumberFormat('fa-IR');
    const rows = coaches.map((c) => {
      const share = db.prepare('SELECT COALESCE(SUM(coach_share),0) AS total FROM payments WHERE coach_id = ? AND substr(created_at,1,10) BETWEEN ? AND ?').get(c.id, f, t);
      const settled = db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM coach_settlements WHERE coach_id = ? AND period = ?').get(c.id, period);
      const sports = db.prepare('SELECT sport, commission_percent, commission_amount FROM coach_sports WHERE coach_id = ?').all(c.id).map((s) => `${s.sport}${s.commission_amount != null && s.commission_amount > 0 ? ` (${fa.format(s.commission_amount)})` : s.commission_percent ? ` (${fa.format(s.commission_percent)}٪)` : ''}`).join(' | ');
      const shareTotal = Number(share.total) || 0;
      const settledTotal = Number(settled.total) || 0;
      return [c.name, c.phone || '', sports, fa.format(shareTotal), fa.format(settledTotal), fa.format(shareTotal - settledTotal)];
    });
    sendCsv(res, `coach_report_${f}_${t}.csv`, ['مربی', 'تلفن', 'رشته‌ها', 'سهم', 'تسویه‌شده', 'مانده'], rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export coach report' });
  }
});

/* =========================
   پورتال مربی (جلسات) — ویژگی پولی
========================= */

// ✅ اهداف تمرینی عضو + نکات پیام شخصی‌سازی‌شده
const GOAL_KEYS = ['weight_loss', 'weight_gain', 'muscle_gain', 'corrective', 'fitness', 'other'];
const GOAL_LABELS = {
  weight_loss: 'کاهش وزن',
  weight_gain: 'افزایش وزن',
  muscle_gain: 'عضله‌سازی',
  corrective: 'اصلاحی',
  fitness: 'تناسب اندام',
  other: 'سایر',
};
const GOAL_TIPS = {
  weight_loss: 'برای نتیجه بهتر در مسیر کاهش وزن، جلسات کاردیو را با تغذیه مناسب ترکیب کن.',
  weight_gain: 'برای افزایش وزن اصولی، مصرف پروتئین و کربوهیدرات سالم را در برنامه‌ات بگنجان.',
  muscle_gain: 'برای عضله‌سازی مؤثرتر، تمرینات قدرتی را منظم انجام بده و استراحت کافی داشته باش.',
  corrective: 'برای اصلاح وضعیت بدن، تمرینات اصلاحی تجویز شده را هر روز و با دقت دنبال کن.',
  fitness: 'برای تناسب اندام، برنامه تمرینی‌ات را منظم دنبال کن و بدن‌ات را هیدراته نگه دار.',
  other: 'تمرینات تجویز شده را منظم پیگیری کن تا سریع‌تر به هدف‌ات برسی.',
};

// ✅ وضعیت اشتراک پنل مربی (حق عضویت مربی به باشگاه)
function coachPlanStatus(staffId) {
  const today = todayIso();
  const row = db.prepare(`
    SELECT * FROM coach_plans
    WHERE coach_staff_id = ? AND status = 'active' AND end_date >= ?
    ORDER BY end_date DESC LIMIT 1
  `).get(staffId, today);
  if (!row) return { active: false };
  return { active: true, plan: row.plan, start_date: row.start_date, end_date: row.end_date, amount: row.amount };
}

// ✅ میدلور: مربی (نقش coach) باید اشتراک پنل فعال داشته باشد؛ ادمین/منشی بدون محدودیت
function coachAccess(req, res, next) {
  if (req.staff.role === 'coach') {
    const s = coachPlanStatus(req.staff.id);
    if (!s.active) {
      return res.status(403).json({
        error: 'COACH_PLAN_EXPIRED',
        message: 'اشتراک پنل مربی شما منقضی شده است. برای تمدید با باشگاه تماس بگیرید.',
      });
    }
  }
  next();
}

const coachGuards = [requireAuth, requireFeature('coach_portal'), coachAccess];
const messagingGuards = [requireAuth, requireFeature('messaging')];

app.get('/coach-sessions', requireAuth, requireFeature('coach_portal'), coachAccess, (req, res) => {
  try {
    const isAdmin = req.staff.role === 'admin';
    const rows = isAdmin
      ? db.prepare('SELECT * FROM coach_sessions ORDER BY session_date DESC, session_time DESC').all()
      : db.prepare('SELECT * FROM coach_sessions WHERE coach_id = ? ORDER BY session_date DESC, session_time DESC').all(req.staff.id);
    const list = rows.map((s) => {
      const m = s.member_id ? db.prepare('SELECT name, phone FROM members WHERE id = ?').get(s.member_id) : null;
      return { ...s, member_name: m ? m.name : null, member_phone: m ? m.phone : null };
    });
    res.json(list);
  } catch (err) {
    console.error('GET /coach-sessions', err);
    res.status(500).json({ error: 'Failed to fetch coach sessions' });
  }
});

app.post('/coach-sessions', requireAuth, requireFeature('coach_portal'), coachAccess, (req, res) => {
  const { member_id, session_date, session_time, duration_minutes, session_type, notes } = req.body || {};
  if (!member_id) return res.status(400).json({ error: 'انتخاب عضو الزامی است' });
  if (!session_date || !session_time) return res.status(400).json({ error: 'تاریخ و ساعت جلسه الزامی است' });
  const member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(Number(member_id));
  if (!member) return res.status(400).json({ error: 'عضو یافت نشد' });
  try {
    const info = db.prepare(`
      INSERT INTO coach_sessions (coach_id, coach_name, member_id, session_date, session_time, duration_minutes, session_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.staff.id,
      req.staff.full_name,
      Number(member_id),
      String(session_date),
      String(session_time),
      Number(duration_minutes) || 60,
      session_type ? String(session_type) : 'personal',
      notes ? String(notes) : null
    );
    const row = db.prepare('SELECT * FROM coach_sessions WHERE id = ?').get(info.lastInsertRowid);
    audit(req, 'coach_session.create', {
      entityType: 'coach_session',
      entityId: info.lastInsertRowid,
      memberId: Number(member_id),
      detail: { date: session_date, time: session_time, type: session_type },
    });
    res.status(201).json({ ...row, member_name: member.name });
  } catch (err) {
    console.error('POST /coach-sessions', err);
    res.status(500).json({ error: 'Failed to create coach session' });
  }
});

app.patch('/coach-sessions/:id', requireAuth, requireFeature('coach_portal'), coachAccess, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM coach_sessions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'جلسه یافت نشد' });
  const isAdmin = req.staff.role === 'admin';
  if (!isAdmin && existing.coach_id !== req.staff.id) {
    return res.status(403).json({ error: 'شما دسترسی به این جلسه ندارید' });
  }
  const { status, notes, session_date, session_time, duration_minutes, session_type } = req.body || {};
  const allowedStatus = ['scheduled', 'completed', 'cancelled'];
  try {
    const updates = [];
    const params = [];
    if (status != null) {
      if (!allowedStatus.includes(status)) return res.status(400).json({ error: 'وضعیت نامعتبر است' });
      updates.push('status = ?');
      params.push(status);
    }
    if (notes != null) { updates.push('notes = ?'); params.push(String(notes)); }
    if (session_date != null) { updates.push('session_date = ?'); params.push(String(session_date)); }
    if (session_time != null) { updates.push('session_time = ?'); params.push(String(session_time)); }
    if (duration_minutes != null) { updates.push('duration_minutes = ?'); params.push(Number(duration_minutes) || 60); }
    if (session_type != null) { updates.push('session_type = ?'); params.push(String(session_type)); }
    if (updates.length === 0) return res.status(400).json({ error: 'هیچ تغییری ارسال نشده است' });
    params.push(id);
    db.prepare(`UPDATE coach_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    /* ── موتور سهم مربی ──
       جلسه که «انجام‌شد» → سهم مربی قطعی می‌شود (idempotent).
       جلسه که از completed خارج شد → سهمِ تسویه‌نشده برداشته می‌شود.
       سهم‌های تسویه‌شده دست‌نخورده می‌مانند تا تاریخچه مالی نشکند. */
    let earnings = null;
    if (status != null) {
      if (status === 'completed') {
        earnings = earnFromSession(db, id);
      } else if (existing.status === 'completed') {
        earnings = revokeSessionEarnings(db, id);
      }
    }

    const row = db.prepare('SELECT * FROM coach_sessions WHERE id = ?').get(id);
    audit(req, 'coach_session.update', {
      entityType: 'coach_session',
      entityId: id,
      memberId: existing.member_id,
      detail: req.body || {},
    });
    res.json({ ...row, earnings });
  } catch (err) {
    console.error('PATCH /coach-sessions/:id', err);
    res.status(500).json({ error: 'Failed to update coach session' });
  }
});

app.delete('/coach-sessions/:id', requireAuth, requireFeature('coach_portal'), coachAccess, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM coach_sessions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'جلسه یافت نشد' });
  const isAdmin = req.staff.role === 'admin';
  if (!isAdmin && existing.coach_id !== req.staff.id) {
    return res.status(403).json({ error: 'شما دسترسی به این جلسه ندارید' });
  }
  try {
    db.prepare('DELETE FROM coach_sessions WHERE id = ?').run(id);
    audit(req, 'coach_session.delete', {
      entityType: 'coach_session',
      entityId: id,
      memberId: existing.member_id,
      detail: { date: existing.session_date },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /coach-sessions/:id', err);
    res.status(500).json({ error: 'Failed to delete coach session' });
  }
});

/* =========================
   برنامه‌های تمرینی مربی
========================= */

function programWithItems(row) {
  if (!row) return null;
  const items = db.prepare('SELECT * FROM workout_program_items WHERE program_id = ? ORDER BY sort_order, id').all(row.id);
  const m = row.member_id ? db.prepare('SELECT name, phone, goal FROM members WHERE id = ?').get(row.member_id) : null;
  return { ...row, items, member_name: m ? m.name : null, member_phone: m ? m.phone : null, member_goal: m ? m.goal : null };
}

app.get('/coach-programs', coachGuards, (req, res) => {
  try {
    const { member_id } = req.query;
    let rows;
    if (member_id) {
      rows = db.prepare('SELECT * FROM workout_programs WHERE member_id = ? ORDER BY id DESC').all(Number(member_id));
    } else if (req.staff.role === 'admin') {
      rows = db.prepare('SELECT * FROM workout_programs ORDER BY id DESC').all();
    } else {
      rows = db.prepare('SELECT * FROM workout_programs WHERE coach_id = ? ORDER BY id DESC').all(req.staff.id);
    }
    res.json(rows.map(programWithItems));
  } catch (err) {
    console.error('GET /coach-programs', err);
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

app.post('/coach-programs', coachGuards, (req, res) => {
  const { member_id, title, goal, notes, items } = req.body || {};
  if (!member_id) return res.status(400).json({ error: 'انتخاب عضو الزامی است' });
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'عنوان برنامه الزامی است' });
  const member = db.prepare('SELECT id FROM members WHERE id = ?').get(Number(member_id));
  if (!member) return res.status(400).json({ error: 'عضو یافت نشد' });
  const list = Array.isArray(items) ? items : [];
  try {
    const info = db.prepare(`
      INSERT INTO workout_programs (member_id, coach_id, coach_name, title, goal, status, notes)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(
      Number(member_id),
      req.staff.id,
      req.staff.full_name,
      String(title).trim(),
      goal ? String(goal) : null,
      notes ? String(notes) : null
    );
    const programId = info.lastInsertRowid;
    const insItem = db.prepare(`
      INSERT INTO workout_program_items (program_id, day, exercise, sets, reps, weight, rest, notes, done, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);
    list.forEach((it, idx) => {
      if (!it || !String(it.exercise || '').trim()) return;
      insItem.run(
        programId,
        it.day != null ? String(it.day) : '1',
        String(it.exercise).trim(),
        Number(it.sets) || 3,
        it.reps != null ? String(it.reps) : '10',
        it.weight != null ? String(it.weight) : null,
        it.rest != null ? String(it.rest) : null,
        it.notes != null ? String(it.notes) : null,
        Number(it.sort_order) || idx
      );
    });
    audit(req, 'workout_program.create', {
      entityType: 'workout_program',
      entityId: programId,
      memberId: Number(member_id),
      detail: { title: String(title).trim() },
    });
    res.status(201).json(programWithItems(db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(programId)));
  } catch (err) {
    console.error('POST /coach-programs', err);
    res.status(500).json({ error: 'Failed to create program' });
  }
});

app.put('/coach-programs/:id', coachGuards, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'برنامه یافت نشد' });
  const isAdmin = req.staff.role === 'admin';
  if (!isAdmin && existing.coach_id !== req.staff.id) {
    return res.status(403).json({ error: 'شما دسترسی به این برنامه ندارید' });
  }
  const { title, goal, notes, items } = req.body || {};
  try {
    db.prepare(`UPDATE workout_programs SET title = ?, goal = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(
        title != null ? String(title).trim() : existing.title,
        goal !== undefined ? (goal ? String(goal) : null) : existing.goal,
        notes !== undefined ? (notes ? String(notes) : null) : existing.notes,
        id
      );
    if (Array.isArray(items)) {
      db.prepare('DELETE FROM workout_program_items WHERE program_id = ?').run(id);
      const insItem = db.prepare(`
        INSERT INTO workout_program_items (program_id, day, exercise, sets, reps, weight, rest, notes, done, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `);
      items.forEach((it, idx) => {
        if (!it || !String(it.exercise || '').trim()) return;
        insItem.run(
          id,
          it.day != null ? String(it.day) : '1',
          String(it.exercise).trim(),
          Number(it.sets) || 3,
          it.reps != null ? String(it.reps) : '10',
          it.weight != null ? String(it.weight) : null,
          it.rest != null ? String(it.rest) : null,
          it.notes != null ? String(it.notes) : null,
          Number(it.sort_order) || idx
        );
      });
    }
    audit(req, 'workout_program.update', {
      entityType: 'workout_program',
      entityId: id,
      memberId: existing.member_id,
      detail: { title: title || existing.title },
    });
    res.json(programWithItems(db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(id)));
  } catch (err) {
    console.error('PUT /coach-programs/:id', err);
    res.status(500).json({ error: 'Failed to update program' });
  }
});

app.patch('/coach-programs/:id/items/:itemId', coachGuards, (req, res) => {
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const existing = db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'برنامه یافت نشد' });
  const isAdmin = req.staff.role === 'admin';
  if (!isAdmin && existing.coach_id !== req.staff.id) {
    return res.status(403).json({ error: 'شما دسترسی به این برنامه ندارید' });
  }
  const item = db.prepare('SELECT * FROM workout_program_items WHERE id = ? AND program_id = ?').get(itemId, id);
  if (!item) return res.status(404).json({ error: 'آیتم یافت نشد' });
  const { done } = req.body || {};
  try {
    db.prepare('UPDATE workout_program_items SET done = ? WHERE id = ?').run(done ? 1 : 0, itemId);
    res.json(programWithItems(db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(id)));
  } catch (err) {
    console.error('PATCH /coach-programs/:id/items/:itemId', err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

app.delete('/coach-programs/:id', coachGuards, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'برنامه یافت نشد' });
  const isAdmin = req.staff.role === 'admin';
  if (!isAdmin && existing.coach_id !== req.staff.id) {
    return res.status(403).json({ error: 'شما دسترسی به این برنامه ندارید' });
  }
  try {
    db.prepare('DELETE FROM workout_program_items WHERE program_id = ?').run(id);
    db.prepare('DELETE FROM workout_programs WHERE id = ?').run(id);
    audit(req, 'workout_program.delete', {
      entityType: 'workout_program',
      entityId: id,
      memberId: existing.member_id,
      detail: { title: existing.title },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /coach-programs/:id', err);
    res.status(500).json({ error: 'Failed to delete program' });
  }
});

app.get('/coach-programs/:id/export.csv', coachGuards, (req, res) => {
  const row = db.prepare('SELECT * FROM workout_programs WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'برنامه یافت نشد' });
  const items = db.prepare('SELECT * FROM workout_program_items WHERE program_id = ? ORDER BY sort_order, id').all(row.id);
  const m = row.member_id ? db.prepare('SELECT name FROM members WHERE id = ?').get(row.member_id) : null;
  const memberName = m ? m.name : '';
  const header = 'عضو;عنوان برنامه;هدف;روز;حرکت;ست;تکرار;وزنه;استراحت;یادداشت;وضعیت\n';
  const lines = items.map((it) => [
    memberName,
    row.title,
    GOAL_LABELS[row.goal] || row.goal || '',
    it.day,
    it.exercise,
    it.sets,
    it.reps,
    it.weight || '',
    it.rest || '',
    it.notes || '',
    it.done ? 'تکمیل شده' : 'در انتظار',
  ].map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="program_${row.id}.csv"`);
  res.send('\uFEFF' + header + lines);
});

/* =========================
   اشتراک پنل مربی (حق عضویت)
========================= */

app.get('/coach-plans', requireAuth, requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT cp.*, s.full_name AS coach_name, s.username AS coach_username
      FROM coach_plans cp
      LEFT JOIN staff s ON s.id = cp.coach_staff_id
      ORDER BY cp.id DESC
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('GET /coach-plans', err);
    res.status(500).json({ error: 'Failed to fetch coach plans' });
  }
});

app.post('/coach-plans', requireAuth, requireAdmin, (req, res) => {
  const { coach_staff_id, plan, amount, months, note } = req.body || {};
  const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(Number(coach_staff_id) || 0);
  if (!staff) return res.status(400).json({ error: 'مربی یافت نشد' });
  const monthsCount = Number(months) || (plan === 'yearly' ? 12 : plan === 'quarterly' ? 3 : 1);
  const start = todayIso();
  const end = new Date(Date.now() + monthsCount * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const amt = Number(amount) || 0;
  try {
    // 🚫 ابطال اشتراک‌های فعال قبلی مربی
    db.prepare(`UPDATE coach_plans SET status = 'cancelled' WHERE coach_staff_id = ? AND status = 'active'`).run(staff.id);
    const info = db.prepare(`
      INSERT INTO coach_plans (coach_staff_id, plan, amount, start_date, end_date, status, note, settled_by)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(staff.id, plan === 'yearly' ? 'yearly' : plan === 'quarterly' ? 'quarterly' : 'monthly', amt, start, end, note ? String(note) : null, req.staff.full_name);
    // 💰 درآمد اشتراک مربی در حسابداری
    db.prepare(`
      INSERT INTO payments (member_id, member_name, sport, coach_id, coach_share, amount, type, method, note, received_by, created_at)
      VALUES (NULL, ?, NULL, NULL, 0, ?, 'coach_subscription', 'cash', ?, ?, datetime('now'))
    `).run(staff.full_name, amt, `حق عضویت پنل مربی (${GOAL_LABELS[plan] || plan})`, req.staff.full_name);
    audit(req, 'coach_plan.create', {
      entityType: 'coach_plan',
      entityId: info.lastInsertRowid,
      detail: { coach: staff.full_name, plan, amount: amt, end_date: end },
    });
    const row = db.prepare(`
      SELECT cp.*, s.full_name AS coach_name, s.username AS coach_username
      FROM coach_plans cp LEFT JOIN staff s ON s.id = cp.coach_staff_id WHERE cp.id = ?
    `).get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    console.error('POST /coach-plans', err);
    res.status(500).json({ error: 'Failed to create coach plan' });
  }
});

app.patch('/coach-plans/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM coach_plans WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'اشتراک یافت نشد' });
  const { status, end_date } = req.body || {};
  try {
    db.prepare(`UPDATE coach_plans SET status = ?, end_date = ? WHERE id = ?`)
      .run(
        status === 'cancelled' ? 'cancelled' : status === 'active' ? 'active' : existing.status,
        end_date != null ? String(end_date) : existing.end_date,
        id
      );
    audit(req, 'coach_plan.update', {
      entityType: 'coach_plan',
      entityId: id,
      detail: { status: status || existing.status },
    });
    res.json(db.prepare('SELECT * FROM coach_plans WHERE id = ?').get(id));
  } catch (err) {
    console.error('PATCH /coach-plans/:id', err);
    res.status(500).json({ error: 'Failed to update coach plan' });
  }
});

app.get('/coach-plans/me', requireAuth, (req, res) => {
  res.json(coachPlanStatus(req.staff.id));
});

/* =========================
   پیام‌رسانی هوشمند — ویژگی پولی
========================= */

app.get('/messages', messagingGuards, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM messages ORDER BY id DESC').all();
    res.json(rows);
  } catch (err) {
    console.error('GET /messages', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/messages', messagingGuards, async (req, res) => {
  const { recipient_type, recipient_id, subject, body, channel, status, personalize } = req.body || {};
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'متن پیام الزامی است' });
  const validRecipientTypes = ['all', 'expiring', 'individual', 'coaches'];
  if (!validRecipientTypes.includes(recipient_type)) {
    return res.status(400).json({ error: 'نوع گیرنده نامعتبر است' });
  }
  const wantSend = status === 'sent';
  const ch = 'sms';
  const personalizeOn = !!personalize;
  const template = String(body).trim();

  let stats = { success_count: 0, failure_count: 0, total: 0 };

  // ✅ پر کردن متغیرهای {name} {goal} {sport} {days_left} + نکتهٔ هدف
  function buildText(r) {
    let text = template
      .replace(/\{name\}/g, r.name || '')
      .replace(/\{goal\}/g, (r.goal && GOAL_LABELS[r.goal]) || '')
      .replace(/\{sport\}/g, r.sport || '')
      .replace(/\{days_left\}/g, r.expiry_date ? String(Math.max(0, Math.ceil((new Date(r.expiry_date) - Date.now()) / 86400000))) : '');
    if (personalizeOn && r.goal && GOAL_TIPS[r.goal]) {
      text = `${text}\n\n${GOAL_TIPS[r.goal]}`;
    }
    return text;
  }

  try {
    const today = todayIso();
    const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let recipients = [];
    if (recipient_type === 'all') {
      recipients = db.prepare(`SELECT id AS member_id, name, phone, goal, sport, expiry_date FROM members WHERE phone IS NOT NULL AND phone != ''`).all();
    } else if (recipient_type === 'expiring') {
      recipients = db.prepare(`
        SELECT m.id AS member_id, m.name, m.phone, m.goal, m.sport, m.expiry_date FROM members m
        WHERE m.phone IS NOT NULL AND m.phone != ''
          AND m.expiry_date >= ? AND m.expiry_date <= ?
      `).all(today, weekLater);
    } else if (recipient_type === 'individual') {
      const m = db.prepare('SELECT id AS member_id, name, phone, goal, sport, expiry_date FROM members WHERE id = ?').get(Number(recipient_id) || 0);
      if (m) recipients = [m];
    } else if (recipient_type === 'coaches') {
      recipients = db.prepare(`SELECT id AS member_id, name, phone FROM coaches WHERE is_active = 1 AND phone IS NOT NULL AND phone != ''`).all();
    }

    if (wantSend) {
      for (const r of recipients) {
        const phone = r.phone ? String(r.phone).trim() : '';
        if (!phone) { stats.failure_count += 1; continue; }
        const message = buildText(r);
        const ok = await sendSMS({ member_id: r.member_id, name: r.name, phone, message, type: 'general' });
        if (ok) stats.success_count += 1;
        else stats.failure_count += 1;
        if (SMS_SEND_DELAY_MS > 0) await delay(SMS_SEND_DELAY_MS);
      }
      stats.total = recipients.length;
    }

    const info = db.prepare(`
      INSERT INTO messages (sender_id, sender_name, recipient_type, recipient_id, subject, body, channel, status, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.staff.id,
      req.staff.full_name,
      recipient_type,
      recipient_type === 'individual' && recipient_id != null ? Number(recipient_id) : null,
      subject ? String(subject) : null,
      template,
      ch,
      wantSend ? 'sent' : 'draft',
      wantSend ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null
    );
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
    audit(req, 'message.create', {
      entityType: 'message',
      entityId: info.lastInsertRowid,
      memberId: recipient_type === 'individual' && recipient_id != null ? Number(recipient_id) : null,
      detail: { recipient_type, channel: ch, status: wantSend ? 'sent' : 'draft', personalize: personalizeOn },
    });
    res.status(201).json({ ...row, stats });
  } catch (err) {
    console.error('POST /messages', err);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

app.delete('/messages/:id', messagingGuards, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'پیام یافت نشد' });
  try {
    db.prepare('DELETE FROM messages WHERE id = ?').run(id);
    audit(req, 'message.delete', {
      entityType: 'message',
      entityId: id,
      detail: { recipient_type: existing.recipient_type },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /messages/:id', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

/* =========================
   موتور سهم مربی — API
========================= */

// ── کاتالوگ پلن‌های شهریه ──

app.get('/accounting/sport-plans', accountingGuards, (req, res) => {
  try {
    const { sport, includeInactive } = req.query || {};
    const rows = db.prepare(`
      SELECT id, sport, label, sessions, price, class_type, is_active, sort_order
      FROM sport_plans
      ${includeInactive ? '' : 'WHERE is_active = 1'}
      ${sport ? 'AND sport = ?' : ''}
      ORDER BY sort_order, sport, sessions
    `).all(...(sport ? [String(sport)] : []));

    // نرخ هر جلسه + سهم پیش‌فرض مربی برای نمایش در فرم ثبت‌نام
    res.json(rows.map((p) => ({
      ...p,
      unit_price: p.sessions > 0 ? Math.round(p.price / p.sessions) : 0,
      default_share_percent: DEFAULT_SHARE_PERCENT,
    })));
  } catch (err) {
    console.error('GET /accounting/sport-plans', err);
    res.status(500).json({ error: 'Failed to list sport plans' });
  }
});

app.post('/accounting/sport-plans', accountingGuards, (req, res) => {
  try {
    const { sport, label, sessions, price, class_type, is_active } = req.body || {};
    if (!sport || !String(sport).trim()) return res.status(400).json({ error: 'نام رشته الزامی است' });
    const sess = Number(sessions) || 0;
    const amt = Number(price) || 0;
    if (sess <= 0) return res.status(400).json({ error: 'تعداد جلسات باید بزرگ‌تر از صفر باشد' });
    if (amt <= 0) return res.status(400).json({ error: 'قیمت باید بزرگ‌تر از صفر باشد' });

    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM sport_plans').get().m;
    const info = db.prepare(`
      INSERT INTO sport_plans (sport, label, sessions, price, class_type, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(sport).trim(),
      label ? String(label).trim() : `${sess} جلسه`,
      sess,
      amt,
      class_type ? String(class_type) : 'group',
      is_active === false ? 0 : 1,
      Number(maxOrder) + 1
    );
    audit(req, 'accounting.sport_plan_create', { entityType: 'sport_plan', entityId: info.lastInsertRowid, detail: { sport, sessions: sess, price: amt } });
    const row = db.prepare('SELECT * FROM sport_plans WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ ...row, unit_price: Math.round(row.price / row.sessions) });
  } catch (err) {
    console.error('POST /accounting/sport-plans', err);
    res.status(500).json({ error: 'Failed to create sport plan' });
  }
});

app.put('/accounting/sport-plans/:id', accountingGuards, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM sport_plans WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'پلن پیدا نشد' });
    const { sport, label, sessions, price, class_type, is_active } = req.body || {};
    const sess = sessions != null ? Number(sessions) : Number(existing.sessions);
    const amt = price != null ? Number(price) : Number(existing.price);
    if (sess <= 0) return res.status(400).json({ error: 'تعداد جلسات باید بزرگ‌تر از صفر باشد' });
    if (amt <= 0) return res.status(400).json({ error: 'قیمت باید بزرگ‌تر از صفر باشد' });
    db.prepare(`
      UPDATE sport_plans SET sport = ?, label = ?, sessions = ?, price = ?, class_type = ?, is_active = ?
      WHERE id = ?
    `).run(
      sport ? String(sport).trim() : existing.sport,
      label ? String(label).trim() : existing.label,
      sess,
      amt,
      class_type ? String(class_type) : existing.class_type,
      is_active != null ? (is_active ? 1 : 0) : existing.is_active,
      id
    );
    audit(req, 'accounting.sport_plan_update', {
      entityType: 'sport_plan', entityId: id,
      detail: { before: { price: existing.price, sessions: existing.sessions }, after: { price: amt, sessions: sess } },
    });
    const row = db.prepare('SELECT * FROM sport_plans WHERE id = ?').get(id);
    res.json({ ...row, unit_price: Math.round(row.price / row.sessions) });
  } catch (err) {
    console.error('PUT /accounting/sport-plans/:id', err);
    res.status(500).json({ error: 'Failed to update sport plan' });
  }
});

// غیرفعال‌سازی نرم (سوابق اعضا دست‌نخورده می‌مانند)
app.delete('/accounting/sport-plans/:id', accountingGuards, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM sport_plans WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'پلن پیدا نشد' });
    const inUse = db.prepare('SELECT COUNT(*) AS c FROM member_sports WHERE sport_plan_id = ?').get(id).c;
    if (inUse > 0) {
      db.prepare('UPDATE sport_plans SET is_active = 0 WHERE id = ?').run(id);
      audit(req, 'accounting.sport_plan_deactivate', { entityType: 'sport_plan', entityId: id, detail: { members: inUse } });
      return res.json({ ok: true, deactivated: true, members_using: inUse });
    }
    db.prepare('DELETE FROM sport_plans WHERE id = ?').run(id);
    audit(req, 'accounting.sport_plan_delete', { entityType: 'sport_plan', entityId: id, detail: { sport: existing.sport } });
    res.json({ ok: true, deleted: true });
  } catch (err) {
    console.error('DELETE /accounting/sport-plans/:id', err);
    res.status(500).json({ error: 'Failed to delete sport plan' });
  }
});

// بازسازی سهم‌ها برای یک جلسه (ابزار نگهداری / بازمحاسبه)
app.post('/accounting/coach-earnings/rebuild', accountingGuards, (req, res) => {
  try {
    const { session_id } = req.body || {};
    const result = session_id
      ? earnFromSession(db, Number(session_id))
      : (() => {
          const ids = db.prepare("SELECT id FROM coach_sessions WHERE status = 'completed'").all();
          let ok = 0;
          let skipped = 0;
          for (const r of ids) {
            const out = earnFromSession(db, r.id);
            if (out.ok) ok += 1; else skipped += 1;
          }
          return { ok: true, processed: ids.length, earned: ok, skipped };
        })();
    audit(req, 'accounting.earnings_rebuild', { entityType: 'coach_earnings', detail: result });
    res.json(result);
  } catch (err) {
    console.error('POST /accounting/coach-earnings/rebuild', err);
    res.status(500).json({ error: 'Failed to rebuild earnings' });
  }
});

// حقوق ثابت ماهانه مربیان
app.post('/accounting/coaches/:id/accrue-salary', accountingGuards, (req, res) => {
  try {
    const id = Number(req.params.id);
    const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(id);
    if (!coach) return res.status(404).json({ error: 'مربی پیدا نشد' });
    const period = String((req.body || {}).period || periodOf(new Date())).slice(0, 7);
    const amount = (req.body || {}).amount != null ? Number(req.body.amount) : Number(coach.monthly_salary) || 0;
    const result = accrueMonthlySalary(db, {
      coachId: id,
      period,
      amount,
      note: (req.body || {}).note,
      actor: req.staff.full_name,
    });
    if (!result.ok) return res.status(400).json({ error: 'حقوق نامعتبر است' });
    audit(req, 'accounting.salary_accrue', { entityType: 'coach', entityId: id, detail: { period, amount } });
    res.json(result);
  } catch (err) {
    console.error('POST /accounting/coaches/:id/accrue-salary', err);
    res.status(500).json({ error: 'Failed to accrue salary' });
  }
});

/* =========================
   START SERVER
========================= */

startCrons();

app.listen(PORT, () => {
  console.log(`Alpha Gym API running at http://localhost:${PORT}`);
});
