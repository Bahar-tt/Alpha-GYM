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
app.use(express.json({ limit: '8mb' }));
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
registerSystemRoutes(app);

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
  } catch (err) { res.status(500).json({ error: 'Failed to get coach' }); }
});

app.post('/coaches', (req, res) => {
  const b = req.body || {};
  if (!b.full_name || !String(b.full_name).trim()) return res.status(400).json({ error: 'نام مربی الزامی است' });
  try {
    const result = db.prepare(`INSERT INTO coaches (full_name, phone, specialty, commission_percent, notes, is_active, has_insurance, insurance_notes, referrer_name, referral_source, training_goal, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      String(b.full_name).trim(), b.phone ? String(b.phone).trim() : null, b.specialty ? String(b.specialty).trim() : null,
      Number(b.commission_percent) || 0, b.notes ? String(b.notes).trim() : null, b.is_active === false || b.is_active === 0 ? 0 : 1,
      b.has_insurance ? 1 : 0, b.insurance_notes ? String(b.insurance_notes).trim() : null,
      b.referrer_name ? String(b.referrer_name).trim() : null, b.referral_source ? String(b.referral_source).trim() : null,
      b.training_goal ? String(b.training_goal).trim() : null, persistPhoto(b.photo_url, 'coach'),
    );
    res.status(201).json(db.prepare('SELECT * FROM coaches WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create coach' }); }
});

app.put('/coaches/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM coaches WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Coach not found' });
  const b = req.body || {};
  try {
    const photoVal = b.photo_url !== undefined
      ? (b.photo_url ? persistPhoto(String(b.photo_url), 'coach') : null)
      : existing.photo_url;
    db.prepare(`UPDATE coaches SET full_name=?, phone=?, specialty=?, commission_percent=?, notes=?, is_active=?, has_insurance=?, insurance_notes=?, referrer_name=?, referral_source=?, training_goal=?, photo_url=? WHERE id=?`).run(
      b.full_name != null ? String(b.full_name).trim() : existing.full_name,
      b.phone !== undefined ? (b.phone ? String(b.phone).trim() : null) : existing.phone,
      b.specialty !== undefined ? (b.specialty ? String(b.specialty).trim() : null) : existing.specialty,
      b.commission_percent != null ? Number(b.commission_percent) : existing.commission_percent,
      b.notes !== undefined ? (b.notes ? String(b.notes).trim() : null) : existing.notes,
      b.is_active !== undefined ? (b.is_active === false || b.is_active === 0 ? 0 : 1) : existing.is_active,
      b.has_insurance !== undefined ? (b.has_insurance ? 1 : 0) : existing.has_insurance,
      b.insurance_notes !== undefined ? (b.insurance_notes ? String(b.insurance_notes).trim() : null) : existing.insurance_notes,
      b.referrer_name !== undefined ? (b.referrer_name ? String(b.referrer_name).trim() : null) : existing.referrer_name,
      b.referral_source !== undefined ? (b.referral_source ? String(b.referral_source).trim() : null) : existing.referral_source,
      b.training_goal !== undefined ? (b.training_goal ? String(b.training_goal).trim() : null) : existing.training_goal,
      photoVal, id,
    );
    const updated = db.prepare('SELECT * FROM coaches WHERE id = ?').get(id);
    db.prepare('UPDATE members SET coach_name = ? WHERE coach_id = ?').run(updated.full_name, id);
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update coach' }); }
});

app.delete('/coaches/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    db.prepare('UPDATE members SET coach_id = NULL, coach_name = NULL WHERE coach_id = ?').run(id);
    const result = db.prepare('DELETE FROM coaches WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Coach not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete coach' }); }
});

app.get('/members', (_req, res) => {
  try { res.json(db.prepare('SELECT * FROM members ORDER BY id DESC').all()); }
  catch (err) { res.status(500).json({ error: 'Failed to list members' }); }
});

app.get('/members/by-code/:code', (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ error: 'code is required' });
    const row = db.prepare('SELECT * FROM members WHERE personnel_code = ? COLLATE NOCASE').get(code);
    if (!row) return res.status(404).json({ error: 'Member not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: 'Failed to lookup member' }); }
});

app.get('/members/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Member not found' });
    const attendanceRows = db.prepare('SELECT * FROM attendances WHERE member_id = ? ORDER BY attended_at DESC LIMIT 50').all(id);
    const attendanceCount = row.attendance_count != null ? row.attendance_count : db.prepare('SELECT COUNT(*) AS c FROM attendances WHERE member_id = ?').get(id).c;
    const receipts = db.prepare('SELECT * FROM receipts WHERE member_id = ? ORDER BY id DESC').all(id);
    res.json({ ...row, attendance_count: attendanceCount, recent_attendances: attendanceRows, receipts });
  } catch (err) { res.status(500).json({ error: 'Failed to get member' }); }
});

function resolveCoachFields(coach_id, coach_name) {
  let cid = coach_id != null && coach_id !== '' ? Number(coach_id) : null;
  let cname = coach_name != null ? String(coach_name).trim() : null;
  if (cid) {
    const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(cid);
    if (coach) cname = coach.full_name; else cid = null;
  }
  return { coach_id: cid, coach_name: cname || null };
}

app.post('/members', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.phone || !b.expiry_date) return res.status(400).json({ error: 'missing fields' });
  const code = b.personnel_code != null ? String(b.personnel_code).trim() : '';
  if (code) {
    const dup = db.prepare('SELECT id FROM members WHERE personnel_code = ? COLLATE NOCASE').get(code);
    if (dup) return res.status(400).json({ error: 'این کد پرسنلی قبلاً ثبت شده است' });
  }
  const coachFields = resolveCoachFields(b.coach_id, b.coach_name);
  try {
    const photoPath = persistPhoto(b.photo_url, 'member');
    const result = db.prepare(`
      INSERT INTO members (
        name, phone, expiry_date, weekly_sessions, birthday, personnel_code, coach_name, coach_id,
        attendance_count, membership_type, start_date, monthly_fee, coach_commission_percent,
        has_insurance, insurance_notes, referrer_name, referral_source, training_goal, photo_url, national_id,
        father_name, sport, height_cm, weight_kg
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(b.name).trim(), String(b.phone).trim(), String(b.expiry_date).trim(), Number(b.weekly_sessions) || 0,
      b.birthday ? String(b.birthday).trim() : null, code || null, coachFields.coach_name, coachFields.coach_id,
      b.membership_type ? String(b.membership_type).trim() : 'monthly',
      b.start_date ? String(b.start_date).trim() : todayIso(),
      Number(b.monthly_fee) || 0, Number(b.coach_commission_percent) || 0,
      b.has_insurance ? 1 : 0,
      b.insurance_notes ? String(b.insurance_notes).trim() : null,
      b.referrer_name ? String(b.referrer_name).trim() : null,
      b.referral_source ? String(b.referral_source).trim() : null,
      b.training_goal ? String(b.training_goal).trim() : null,
      photoPath,
      b.national_id ? String(b.national_id).trim() : null,
      b.father_name ? String(b.father_name).trim() : null,
      b.sport ? String(b.sport).trim() : null,
      b.height_cm != null ? Number(b.height_cm) : null,
      b.weight_kg != null ? Number(b.weight_kg) : null,
    );
    const row = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
    onMemberCreated(row);
    let receipt = null;
    try {
      receipt = createReceipt({
        member_id: row.id, member_name: row.name, phone: row.phone, type: 'registration',
        amount: Number(row.monthly_fee) || 0, months: 1, membership_type: row.membership_type,
        description: 'ثبت‌نام اولیه عضویت', period_start: row.start_date, period_end: row.expiry_date,
      });
    } catch (e) { console.error('receipt create failed', e); }
    res.status(201).json({ ...row, receipt });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create member' }); }
});

app.put('/members/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Member not found' });
  const b = req.body || {};
  if (b.personnel_code != null && String(b.personnel_code).trim()) {
    const dup = db.prepare('SELECT id FROM members WHERE personnel_code = ? COLLATE NOCASE AND id != ?').get(String(b.personnel_code).trim(), id);
    if (dup) return res.status(400).json({ error: 'این کد پرسنلی قبلاً برای عضو دیگری ثبت شده است' });
  }
  const coachFields = b.coach_id !== undefined || b.coach_name !== undefined
    ? resolveCoachFields(b.coach_id !== undefined ? b.coach_id : existing.coach_id, b.coach_name !== undefined ? b.coach_name : existing.coach_name)
    : { coach_id: existing.coach_id, coach_name: existing.coach_name };
  const oldExpiry = existing.expiry_date;
  try {
    const photoPath = b.photo_url !== undefined
      ? (b.photo_url ? persistPhoto(String(b.photo_url), 'member') : null)
      : existing.photo_url;
    db.prepare(`
      UPDATE members SET
        name=?, phone=?, expiry_date=?, weekly_sessions=?, birthday=?, personnel_code=?,
        coach_name=?, coach_id=?, membership_type=?, start_date=?, attendance_count=?,
        monthly_fee=?, coach_commission_percent=?,
        has_insurance=?, insurance_notes=?, referrer_name=?, referral_source=?, training_goal=?, photo_url=?, national_id=?,
        father_name=?, sport=?, height_cm=?, weight_kg=?
      WHERE id=?
    `).run(
      b.name != null ? String(b.name).trim() : existing.name,
      b.phone != null ? String(b.phone).trim() : existing.phone,
      b.expiry_date != null ? String(b.expiry_date).trim() : existing.expiry_date,
      b.weekly_sessions != null ? Number(b.weekly_sessions) : existing.weekly_sessions,
      b.birthday !== undefined ? (b.birthday ? String(b.birthday).trim() : null) : existing.birthday,
      b.personnel_code !== undefined ? (b.personnel_code ? String(b.personnel_code).trim() : null) : existing.personnel_code,
      coachFields.coach_name, coachFields.coach_id,
      b.membership_type != null ? String(b.membership_type).trim() : existing.membership_type || 'monthly',
      b.start_date != null ? String(b.start_date).trim() : existing.start_date,
      b.attendance_count != null ? Number(b.attendance_count) : existing.attendance_count || 0,
      b.monthly_fee != null ? Number(b.monthly_fee) : existing.monthly_fee || 0,
      b.coach_commission_percent != null ? Number(b.coach_commission_percent) : existing.coach_commission_percent || 0,
      b.has_insurance !== undefined ? (b.has_insurance ? 1 : 0) : existing.has_insurance || 0,
      b.insurance_notes !== undefined ? (b.insurance_notes ? String(b.insurance_notes).trim() : null) : existing.insurance_notes,
      b.referrer_name !== undefined ? (b.referrer_name ? String(b.referrer_name).trim() : null) : existing.referrer_name,
      b.referral_source !== undefined ? (b.referral_source ? String(b.referral_source).trim() : null) : existing.referral_source,
      b.training_goal !== undefined ? (b.training_goal ? String(b.training_goal).trim() : null) : existing.training_goal,
      photoPath,
      b.national_id !== undefined ? (b.national_id ? String(b.national_id).trim() : null) : existing.national_id,
      b.father_name !== undefined ? (b.father_name ? String(b.father_name).trim() : null) : existing.father_name,
      b.sport !== undefined ? (b.sport ? String(b.sport).trim() : null) : existing.sport,
      b.height_cm !== undefined ? (b.height_cm != null ? Number(b.height_cm) : null) : existing.height_cm,
      b.weight_kg !== undefined ? (b.weight_kg != null ? Number(b.weight_kg) : null) : existing.weight_kg,
      id,
    );
    const row = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    let receipt = null;
    if (b._renewal || (b.expiry_date && String(b.expiry_date) !== oldExpiry)) {
      const amount = b._renewal?.amount != null ? Number(b._renewal.amount) : Number(row.monthly_fee) || 0;
      const months = b._renewal?.months != null ? Number(b._renewal.months) : 1;
      try {
        receipt = createReceipt({
          member_id: row.id, member_name: row.name, phone: row.phone, type: 'renewal',
          amount, months, membership_type: row.membership_type, description: 'تمدید عضویت',
          period_start: oldExpiry, period_end: row.expiry_date,
        });
      } catch (e) { console.error('renewal receipt failed', e); }
    }
    res.json({ ...row, receipt });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update member' }); }
});

app.delete('/members/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    db.prepare('DELETE FROM attendances WHERE member_id = ?').run(id);
    const result = db.prepare('DELETE FROM members WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Member not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete member' }); }
});

app.post('/attendance', (req, res) => {
  const { personnel_code, member_id, source } = req.body || {};
  try {
    let member = null;
    if (member_id != null) member = db.prepare('SELECT * FROM members WHERE id = ?').get(Number(member_id));
    else if (personnel_code) member = db.prepare('SELECT * FROM members WHERE personnel_code = ? COLLATE NOCASE').get(String(personnel_code).trim());
    if (!member) return res.status(404).json({ error: 'Member not found' });
    db.prepare(`INSERT INTO attendances (member_id, personnel_code, source) VALUES (?, ?, ?)`).run(
      member.id, member.personnel_code || (personnel_code ? String(personnel_code).trim() : null), source ? String(source).trim() : 'fingerprint',
    );
    db.prepare(`UPDATE members SET attendance_count = COALESCE(attendance_count, 0) + 1 WHERE id = ?`).run(member.id);
    res.status(201).json({ success: true, member: db.prepare('SELECT * FROM members WHERE id = ?').get(member.id) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to record attendance' }); }
});

app.get('/sms/logs', (_req, res) => {
  try { res.json(db.prepare('SELECT * FROM sms_logs ORDER BY id DESC LIMIT 500').all()); }
  catch (err) { res.status(500).json({ error: 'Failed to list SMS logs' }); }
});

app.post('/sms/send', async (req, res) => {
  const { member_id, name, phone, message, type } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: 'phone and message are required' });
  try {
    const ok = await sendSMS({
      member_id: member_id != null ? Number(member_id) : null,
      name: name ? String(name).trim() : '',
      phone: String(phone).trim(),
      message: String(message).trim(),
      type: type ? String(type).trim() : 'general',
    });
    const log = db.prepare('SELECT * FROM sms_logs ORDER BY id DESC LIMIT 1').get();
    if (!ok) return res.status(502).json({ success: false, error: 'Failed to send SMS', log: log || null });
    res.status(201).json({ success: true, log });
  } catch (err) { res.status(500).json({ error: 'Failed to send SMS' }); }
});

app.post('/sms/broadcast', async (req, res) => {
  const { recipients, message } = req.body || {};
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: 'recipients array is required' });
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'message is required' });
  const normalizedMessage = String(message).trim();
  let successCount = 0, failureCount = 0;
  const details = [];
  for (const recipient of recipients) {
    const phone = recipient?.phone ? String(recipient.phone).trim() : '';
    if (!phone) { failureCount += 1; details.push({ member_id: recipient?.member_id ?? null, phone: '', success: false, error: 'missing phone' }); continue; }
    try {
      const ok = await sendSMS({ member_id: recipient.member_id != null ? Number(recipient.member_id) : null, name: recipient.name != null ? String(recipient.name).trim() : '', phone, message: normalizedMessage });
      if (ok) { successCount += 1; details.push({ member_id: recipient.member_id, phone, success: true }); }
      else { failureCount += 1; details.push({ member_id: recipient.member_id, phone, success: false, error: 'send failed' }); }
    } catch (err) {
      failureCount += 1;
      details.push({ member_id: recipient.member_id, phone, success: false, error: err instanceof Error ? err.message : 'unknown' });
    }
    await delay(SMS_SEND_DELAY_MS);
  }
  res.json({ success_count: successCount, failure_count: failureCount, total: recipients.length, details });
});

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
