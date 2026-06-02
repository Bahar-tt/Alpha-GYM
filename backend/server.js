const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = 3001;
const DB_PATH = path.join(__dirname, 'gym.db');

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    weekly_sessions INTEGER NOT NULL DEFAULT 0
  )
`);

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

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
    console.log(`  - id=${m.id} name=${m.name} phone=${m.phone} expiry=${m.expiry_date}`);
  });
}

cron.schedule('0 9 * * *', checkExpiredMembers, { timezone: 'Asia/Tehran' });
console.log('Cron scheduled: daily at 09:00 (Asia/Tehran) — expired member check');

setTimeout(checkExpiredMembers, 3000);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/members', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM members ORDER BY id DESC').all();
    res.json(rows);
  } catch (err) {
    console.error('GET /members', err);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

app.post('/members', (req, res) => {
  const { name, phone, expiry_date, weekly_sessions } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!phone || !String(phone).trim()) {
    return res.status(400).json({ error: 'phone is required' });
  }
  if (!expiry_date || !String(expiry_date).trim()) {
    return res.status(400).json({ error: 'expiry_date is required' });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO members (name, phone, expiry_date, weekly_sessions)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        String(name).trim(),
        String(phone).trim(),
        String(expiry_date).trim(),
        Number(weekly_sessions) || 0
      );

    const row = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    console.error('POST /members', err);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

app.put('/members/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid member id' });
  }

  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const { name, phone, expiry_date, weekly_sessions } = req.body || {};

  try {
    db.prepare(
      `UPDATE members SET
        name = ?,
        phone = ?,
        expiry_date = ?,
        weekly_sessions = ?
       WHERE id = ?`
    ).run(
      name != null ? String(name).trim() : existing.name,
      phone != null ? String(phone).trim() : existing.phone,
      expiry_date != null ? String(expiry_date).trim() : existing.expiry_date,
      weekly_sessions != null ? Number(weekly_sessions) : existing.weekly_sessions,
      id
    );

    const row = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    res.json(row);
  } catch (err) {
    console.error('PUT /members/:id', err);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

app.delete('/members/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid member id' });
  }

  try {
    const result = db.prepare('DELETE FROM members WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    res.json({ ok: true, id });
  } catch (err) {
    console.error('DELETE /members/:id', err);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

app.listen(PORT, () => {
  console.log(`Alpha Gym API running at http://localhost:${PORT}`);
});
