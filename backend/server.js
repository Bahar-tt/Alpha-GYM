require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { onMemberCreated } = require('./services/eventService');
const { sendSMS } = require('./services/smsService');
const { startCrons } = require('./services/cronManager');
const { registerAccountingRoutes } = require('./routes/accounting');
const { registerReceiptRoutes } = require('./routes/receipts');
const { registerSystemRoutes } = require('./routes/system');

const PORT = Number(process.env.PORT) || 8000;
const ENV = process.env.NODE_ENV || 'development';
const DATA_DIR = process.env.DATA_DIR || (process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : '/app/data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'gym.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

console.log(`[ENV] ${ENV} | DATA=${DATA_DIR} | DB=${DB_PATH}`);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
app.set('trust proxy', true);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// bootstrap core tables
db.exec(`CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
  expiry_date TEXT NOT NULL, weekly_sessions INTEGER NOT NULL DEFAULT 0,
  birthday TEXT, personnel_code TEXT, coach_name TEXT, attendance_count INTEGER NOT NULL DEFAULT 0,
  membership_type TEXT DEFAULT 'monthly', start_date TEXT
)`);
const memberCols = db.prepare('PRAGMA table_info(members)').all().map(c => c.name);
const addCol = (n, d) => { if (!memberCols.includes(n)) { db.exec(`ALTER TABLE members ADD COLUMN ${n} ${d}`); } };
['personnel_code TEXT','coach_name TEXT','attendance_count INTEGER NOT NULL DEFAULT 0',
 "membership_type TEXT DEFAULT 'monthly'",'start_date TEXT','coach_id INTEGER',
 'monthly_fee REAL DEFAULT 0','coach_commission_percent REAL DEFAULT 0',
 'has_insurance INTEGER DEFAULT 0','insurance_notes TEXT','referrer_name TEXT',
 'referral_source TEXT','training_goal TEXT','photo_url TEXT','national_id TEXT',
 'father_name TEXT','sport TEXT','height_cm REAL','weight_kg REAL','sports_json TEXT'].forEach(s => {
  const [n, ...rest] = s.split(' '); addCol(n, rest.join(' '));
});

db.exec(`CREATE TABLE IF NOT EXISTS coaches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, phone TEXT, specialty TEXT,
  commission_percent REAL DEFAULT 0, notes TEXT, is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
)`);
const coachCols = db.prepare('PRAGMA table_info(coaches)').all().map(c => c.name);
['has_insurance INTEGER DEFAULT 0','insurance_notes TEXT','referrer_name TEXT',
 'referral_source TEXT','training_goal TEXT','photo_url TEXT'].forEach(s => {
  const [n, ...rest] = s.split(' '); if (!coachCols.includes(n)) db.exec(`ALTER TABLE coaches ADD COLUMN ${n} ${rest.join(' ')}`);
});

db.exec(`CREATE TABLE IF NOT EXISTS attendances (
  id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, personnel_code TEXT,
  attended_at TEXT DEFAULT (datetime('now')), source TEXT DEFAULT 'manual'
)`);
db.exec(`CREATE TABLE IF NOT EXISTS sms_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER, name TEXT, phone TEXT NOT NULL,
  message TEXT NOT NULL, type TEXT DEFAULT 'general', status TEXT NOT NULL DEFAULT 'sent',
  created_at TEXT DEFAULT (datetime('now'))
)`);

function todayIso() { return new Date().toISOString().split('T')[0]; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
const SMS_SEND_DELAY_MS = Number(process.env.SMS_SEND_DELAY_MS) || 400;

function persistPhoto(photo, prefix = 'member') {
  if (!photo || typeof photo !== 'string') return null;
  const s = photo.trim();
  if (!s) return null;
  if (s.startsWith('/uploads/') || s.startsWith('http://') || s.startsWith('https://')) return s;
  const m = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return s;
  const ext = (m[1].split('/')[1] || 'jpg').replace('jpeg', 'jpg').split('+')[0];
  const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try {
    fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(m[2], 'base64'));
    return `/uploads/${name}`;
  } catch (e) { console.error('[UPLOAD]', e); return s; }
}

cron.schedule('0 9 * * *', () => {
  const expired = db.prepare('SELECT * FROM members WHERE expiry_date < ?').all(todayIso());
  console.log(`[cron] Expired: ${expired.length}`);
}, { timezone: 'Asia/Tehran' });

app.get('/health', (req, res) => res.json({ ok: true, data_dir: DATA_DIR, db_path: DB_PATH, port: PORT, host: req.headers.host || null }));

const { createReceipt } = registerReceiptRoutes(app, db);
registerAccountingRoutes(app, db);
registerSystemRoutes(app, db, { uploadsDir: UPLOADS_DIR });

// load remaining route modules (members, coaches, sms, attendance)
require('./routes/coreApi')(app, db, { persistPhoto, createReceipt, todayIso, sendSMS, SMS_SEND_DELAY_MS, delay });
// fingerprint / card agent
require('./routes/attendanceScan')(app, db);

const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    const p = req.path;
    if (['/members','/coaches','/sms','/attendance','/accounting','/receipts','/system','/health','/uploads'].some(x => p.startsWith(x))) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`[STATIC] ${distPath}`);
}

startCrons();
app.listen(PORT, '0.0.0.0', () => console.log(`Alpha Gym http://0.0.0.0:${PORT}`));
