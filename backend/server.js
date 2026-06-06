const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const { todayJalali } = require('./utils/date');
const { onMemberCreated } = require('./services/eventService');
const { sendSMS } = require('./services/smsService');
const cron = require('node-cron');
const { startCrons } = require('./services/cronManager');

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
    weekly_sessions INTEGER NOT NULL DEFAULT 0,
    birthday TEXT
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

/* =========================
   HELPERS
========================= */

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

/* =========================
   EXPIRY CHECK
========================= */

function checkExpiredMembers() {
  const today = todayIso();

  const expired = db
    .prepare('SELECT * FROM members WHERE expiry_date < ? ORDER BY expiry_date')
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
function checkBirthdays() {
const today = todayJalali();

const [, month, day] = today.split('/');

  const members = db
    .prepare(`
      SELECT *
      FROM members
      WHERE birthday IS NOT NULL
    `)
    .all();

  const birthdayMembers = members.filter((m) => {
    const parts = String(m.birthday).split('/');

    if (parts.length !== 3) return false;

    return parts[1] === month && parts[2] === day;
  });

  if (birthdayMembers.length === 0) {
    console.log('[Birthday Check] No birthdays today');
    return;
  }

  console.log(
    `[Birthday Check] Found ${birthdayMembers.length} birthday(s)`
  );

  const sms = require('./services/smsService');

  birthdayMembers.forEach((member) => {
    sms.sendBirthday(member);
  });
}

function checkExpiryReminders() {
  const today = new Date();

  const targetDates = [1, 3, 7].map((days) => {
    const d = new Date();
    d.setDate(today.getDate() + days);
    return d.toISOString().split('T')[0];
  });

  const placeholders = targetDates.map(() => '?').join(',');

  const members = db.prepare(`
    SELECT *
    FROM members
    WHERE expiry_date IN (${placeholders})
  `).all(...targetDates);

  if (members.length === 0) {
    console.log('[Expiry Reminder] No expiring members soon');
    return;
  }

  console.log(
    `[Expiry Reminder] Found ${members.length} member(s)`
  );

  const sms = require('./services/smsService');

  members.forEach((member) => {
    const daysLeft = Math.ceil(
      (new Date(member.expiry_date) - today) / (1000 * 60 * 60 * 24)
    );

    sms.sendExpiryWarning(member, daysLeft);
  });
}

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

app.get('/members', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM members ORDER BY id DESC').all();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

app.post('/members', (req, res) => {
  const { name, phone, expiry_date, weekly_sessions, birthday } = req.body || {};

  if (!name || !phone || !expiry_date) {
    return res.status(400).json({ error: 'missing fields' });
  }

  try {
    const result = db
      .prepare(`
        INSERT INTO members (
          name, phone, expiry_date, weekly_sessions, birthday
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        String(name).trim(),
        String(phone).trim(),
        String(expiry_date).trim(),
        Number(weekly_sessions) || 0,
        birthday ? String(birthday).trim() : null
      );

    const row = db
      .prepare('SELECT * FROM members WHERE id = ?')
      .get(result.lastInsertRowid);

    // 🔥 EVENT SYSTEM ( )
    onMemberCreated(row);

    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

app.put('/members/:id', (req, res) => {
  const id = Number(req.params.id);

  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);

  if (!existing) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const { name, phone, expiry_date, weekly_sessions, birthday } = req.body || {};

  try {
    db.prepare(`
      UPDATE members SET
        name = ?,
        phone = ?,
        expiry_date = ?,
        weekly_sessions = ?,
        birthday = ?
      WHERE id = ?
    `).run(
      name != null ? String(name).trim() : existing.name,
      phone != null ? String(phone).trim() : existing.phone,
      expiry_date != null ? String(expiry_date).trim() : existing.expiry_date,
      weekly_sessions != null ? Number(weekly_sessions) : existing.weekly_sessions,
      birthday != null ? String(birthday).trim() : existing.birthday,
      id
    );

    const row = db.prepare('SELECT * FROM members WHERE id = ?').get(id);

    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

app.delete('/members/:id', (req, res) => {
  const id = Number(req.params.id);

  try {
    const result = db.prepare('DELETE FROM members WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

/* =========================
   SMS LOGS
========================= */
app.get('/sms-logs', (req, res) => {
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
app.post('/sms/send', (req, res) => {
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
    const ok = sendSMS({
      member_id: member_id != null ? Number(member_id) : null,
      name: name != null ? String(name).trim() : '',
      phone: normalizedPhone,
      message: normalizedMessage,
      status: 'mock',
    });

    const log = db.prepare('SELECT * FROM sms_logs ORDER BY id DESC LIMIT 1').get();

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
app.post('/sms/broadcast', (req, res) => {
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
      const ok = sendSMS({
        member_id: recipient.member_id != null ? Number(recipient.member_id) : null,
        name: recipient.name != null ? String(recipient.name).trim() : '',
        phone,
        message: normalizedMessage,
        status: 'mock',
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
  }

  res.json({
    success_count: successCount,
    failure_count: failureCount,
    total: recipients.length,
    details,
  });
});

/* =========================
   START SERVER
========================= */

startCrons();

app.listen(PORT, () => {
  console.log(`Alpha Gym API running at http://localhost:${PORT}`);
});