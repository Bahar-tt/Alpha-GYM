const crypto = require('crypto');

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function makeToken() {
  return crypto.randomBytes(16).toString('hex');
}

function registerReceiptRoutes(app, db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      member_id INTEGER,
      member_name TEXT,
      phone TEXT,
      type TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      months INTEGER DEFAULT 0,
      membership_type TEXT,
      description TEXT,
      period_start TEXT,
      period_end TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  function createReceipt(payload) {
    const token = makeToken();
    const result = db
      .prepare(`
        INSERT INTO receipts (
          token, member_id, member_name, phone, type, amount, months,
          membership_type, description, period_start, period_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        token,
        payload.member_id != null ? Number(payload.member_id) : null,
        payload.member_name || null,
        payload.phone || null,
        payload.type || 'registration',
        Number(payload.amount) || 0,
        Number(payload.months) || 0,
        payload.membership_type || null,
        payload.description || null,
        payload.period_start || null,
        payload.period_end || null,
      );
    return db.prepare('SELECT * FROM receipts WHERE id = ?').get(result.lastInsertRowid);
  }

  app.post('/receipts', (req, res) => {
    try {
      const row = createReceipt(req.body || {});
      res.status(201).json(row);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create receipt' });
    }
  });

  app.get('/receipts/token/:token', (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM receipts WHERE token = ?').get(String(req.params.token));
      if (!row) return res.status(404).json({ error: 'فیش یافت نشد' });
      res.json(row);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to get receipt' });
    }
  });

  app.get('/receipts/member/:memberId', (req, res) => {
    try {
      const rows = db
        .prepare('SELECT * FROM receipts WHERE member_id = ? ORDER BY id DESC')
        .all(Number(req.params.memberId));
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list receipts' });
    }
  });

  return { createReceipt };
}

module.exports = { registerReceiptRoutes };
