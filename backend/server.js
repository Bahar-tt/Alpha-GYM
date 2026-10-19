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
app.set('trust proxy', true);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// schema bootstrap
require('./bootstrapDb')(db);

function todayIso() {
  return new Date().toISOString().split('T')[0];
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
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

require('./routes/members')(app, db, { persistPhoto, createReceipt, todayIso, sendSMS, SMS_SEND_DELAY_MS, delay });
require('./routes/coaches')(app, db, { persistPhoto });
require('./routes/attendanceSms')(app, db, { sendSMS, SMS_SEND_DELAY_MS, delay, todayIso });

const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/members') || req.path.startsWith('/coaches') || req.path.startsWith('/sms') || req.path.startsWith('/attendance') || req.path.startsWith('/accounting') || req.path.startsWith('/receipts') || req.path.startsWith('/system') || req.path.startsWith('/health') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`[STATIC] Serving frontend from ${distPath}`);
} else {
  console.log('[STATIC] No dist/ folder found — API-only mode (dev)');
}

startCrons();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Alpha Gym running at http://0.0.0.0:${PORT}`);
});
