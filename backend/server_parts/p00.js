require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { onMemberCreated } = require('./services/eventService');
const { sendSMS } = require('./services/smsService');
const cron = require('node-cron');
const { startCrons } = require('./services/cronManager');
const { registerAccountingRoutes } = require('./routes/accounting');
const { registerReceiptRoutes } = require('./routes/receipts');
const { registerSystemRoutes } = require('./routes/system');

const PORT = Number(process.env.PORT) || 8000;
const ENV = process.env.NODE_ENV || 'development';
// Persistent disk mount point (Cloudflare / Railway / Docker volume)
const DATA_DIR = process.env.DATA_DIR || (process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : '/app/data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'gym.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

console.log(`[ENV] Running in ${ENV}`);
console.log(`[DATA] DATA_DIR=${DATA_DIR}`);
console.log(`[DB] Using database at ${DB_PATH}`);
console.log(`[UPLOADS] Photos at ${UPLOADS_DIR}`);

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
// Behind Runflare / reverse proxy — trust X-Forwarded-* so any domain works
app.set('trust proxy', true);
// Allow any origin (temporary + custom domains, http/https)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' })); // backups with photos
// Serve uploaded photos from persistent disk
app.use('/uploads', express.static(UPLOADS_DIR));

const db = new Database(DB_PATH);
// Better durability across process restarts
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    weekly_sessions INTEGER NOT NULL DEFAULT 0,
    birthday TEXT,
    personnel_code TEXT,
    coach_name TEXT,
    attendance_count INTEGER NOT NULL DEFAULT 0,
    membership_type TEXT DEFAULT 'monthly',
    start_date TEXT
  )
`);

const memberCols = db.prepare(`PRAGMA table_info(members)`).all().map((c) => c.name);
const addCol = (name, def) => {
  if (!memberCols.includes(name)) {
    db.exec(`ALTER TABLE members ADD COLUMN ${name} ${def}`);
    console.log(`[DB] Added column members.${name}`);
  }
};
addCol('personnel_code', 'TEXT');
addCol('coach_name', 'TEXT');
addCol('attendance_count', 'INTEGER NOT NULL DEFAULT 0');
addCol('membership_type', "TEXT DEFAULT 'monthly'");
addCol('start_date', 'TEXT');
addCol('coach_id', 'INTEGER');
addCol('monthly_fee', 'REAL DEFAULT 0');
addCol('coach_commission_percent', 'REAL DEFAULT 0');
addCol('has_insurance', 'INTEGER DEFAULT 0');
addCol('insurance_notes', 'TEXT');
addCol('referrer_name', 'TEXT');
addCol('referral_source', 'TEXT');
addCol('training_goal', 'TEXT');
addCol('photo_url', 'TEXT');
addCol('national_id', 'TEXT');
addCol('father_name', 'TEXT');
addCol('sport', 'TEXT');
addCol('height_cm', 'REAL');
addCol('weight_kg', 'REAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS coaches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT,
    specialty TEXT,
    commission_percent REAL DEFAULT 0,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const coachCols = db.prepare(`PRAGMA table_info(coaches)`).all().map((c) => c.name);
const addCoachCol = (name, def) => {
  if (!coachCols.includes(name)) {
    db.exec(`ALTER TABLE coaches ADD COLUMN ${name} ${def}`);
    console.log(`[DB] Added column coaches.${name}`);
  }
};
addCoachCol('has_insurance', 'INTEGER DEFAULT 0');
addCoachCol('insurance_notes', 'TEXT');
addCoachCol('referrer_name', 'TEXT');
addCoachCol('referral_source', 'TEXT');
addCoachCol('training_goal', 'TEXT');
addCoachCol('photo_url', 'TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS attendances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    personnel_code TEXT,
    attended_at TEXT DEFAULT (datetime('now')),
    source TEXT DEFAULT 'manual',
    FOREIGN KEY (member_id) REFERENCES members(id)
  )
`);

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

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const SMS_SEND_DELAY_MS = Number(process.env.SMS_SEND_DELAY_MS) || 400;

/** Save data-URL or keep existing URL; returns path under /uploads or original string */
function persistPhoto(photo, prefix = 'member') {
  if (!photo || typeof photo !== 'string') return null;
  const s = photo.trim();
  if (!s) return null;
  if (s.startsWith('/uploads/') || s.startsWith('http://') || s.startsWith('https://')) return s;
  const m = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return s;
  const ext = (m[1].split('/')[1] || 'jpg').replace('jpeg', 'jpg').split('+')[0];
  const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, name);
  try {
    fs.writeFileSync(filePath, Buffer.from(m[2], 'base64'));
    console.log(`[UPLOAD] saved ${name}`);
    return `/uploads/${name}`;
  } catch (e) {
    console.error('[UPLOAD] failed', e);
    return s;
  }
}

cron.schedule('0 9 * * *', () => {
  const today = todayIso();
  const expired = db.prepare('SELECT * FROM members WHERE expiry_date < ? ORDER BY expiry_date').all(today);
  console.log(`[cron] Expired members: ${expired.length}`);
}, { timezone: 'Asia/Tehran' });

app.get('/health', (req, res) => res.json({
  ok: true,
  data_dir: DATA_DIR,
  db_path: DB_PATH,
  port: PORT,
  host: req.headers.host || null,
}));

const { createReceipt } = registerReceiptRoutes(app, db);
registerAccountingRoutes(app, db);
registerSystemRoutes(app, db, { uploadsDir: UPLOADS_DIR });

app.get('/coaches', (_req, res) => {
  try { res.json(db.prepare('SELECT * FROM coaches ORDER BY id DESC').all()); }
  catch (err) { res.status(500).json({ error: 'Failed to list coaches' }); }
});

app.get('/coaches/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(id);
    if (!coach) return res.status(404).json({ error: 'Coach not found' });
    const members = db.prepare('SELECT * FROM members WHERE coach_id = ? ORDER BY id DESC').all(id);
    let totalFee = 0, totalCommission = 0;
    members.forEach((m) => {
      const fee = Number(m.monthly_fee) || 0;
      const pct = Number(m.coach_commission_percent) || Number(coach.commission_percent) || 0;
      totalFee += fee; totalCommission += (fee * pct) / 100;
    });
    res.json({ ...coach, members, stats: { member_count: members.length, total_monthly_fee: totalFee, total_commission: totalCommission } });
  } catch 