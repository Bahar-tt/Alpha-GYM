/**
 * Attendance scan API for desktop fingerprint/card agent.
 * Mount: require('./attendanceScan')(app, db, { requireAuth, PORT });
 */
module.exports = function registerAttendanceScan(app, db, opts = {}) {
  const requireAuth = opts.requireAuth;
  const PORT = opts.PORT || 3001;

  db.exec(`
    CREATE TABLE IF NOT EXISTS attendances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      member_code TEXT,
      attended_at TEXT DEFAULT (datetime('now')),
      source TEXT DEFAULT 'scanner',
      device_id TEXT
    )
  `);

  app.get('/attendance/scan/health', (_req, res) => {
    res.json({ ok: true, endpoint: '/attendance/scan', mode: 'bahar-tt', port: PORT });
  });

  app.post('/attendance/scan', (req, res) => {
    const b = req.body || {};
    const code = String(
      b.member_code || b.personnel_code || b.uid || b.code || ''
    ).trim();

    if (!code) {
      return res.status(400).json({ ok: false, error: 'member_code is required' });
    }

    try {
      let member = db
        .prepare('SELECT * FROM members WHERE member_code = ? COLLATE NOCASE')
        .get(code);

      if (!member && /^\d+$/.test(code)) {
        member = db.prepare('SELECT * FROM members WHERE id = ?').get(Number(code));
      }

      if (!member) {
        member = db
          .prepare(
            "SELECT * FROM members WHERE member_code IS NOT NULL AND (member_code LIKE ? OR ? LIKE '%' || member_code || '%') COLLATE NOCASE LIMIT 1"
          )
          .get(`%${code}%`, code);
      }

      if (!member) {
        return res.status(404).json({
          ok: false,
          error: 'Member not found',
          message: `عضوی با کد ${code} یافت نشد`,
          code,
        });
      }

      const source = b.source || 'scanner';
      const deviceId = b.device_id || null;
      const attendedAt =
        b.scan_time && !Number.isNaN(Date.parse(b.scan_time))
          ? new Date(b.scan_time).toISOString()
          : null;

      if (attendedAt) {
        db.prepare(
          'INSERT INTO attendances (member_id, member_code, attended_at, source, device_id) VALUES (?,?,?,?,?)'
        ).run(member.id, member.member_code || code, attendedAt, source, deviceId);
      } else {
        db.prepare(
          'INSERT INTO attendances (member_id, member_code, source, device_id) VALUES (?,?,?,?)'
        ).run(member.id, member.member_code || code, source, deviceId);
      }

      const sport = db
        .prepare(
          `SELECT id FROM member_sports
           WHERE member_id = ?
           ORDER BY CASE WHEN date(expiry_date) >= date('now') THEN 0 ELSE 1 END, id
           LIMIT 1`
        )
        .get(member.id);

      if (sport) {
        db.prepare(
          'UPDATE member_sports SET used_sessions = COALESCE(used_sessions, 0) + 1 WHERE id = ?'
        ).run(sport.id);
      }

      db.prepare(
        'UPDATE members SET used_sessions = COALESCE(used_sessions, 0) + 1 WHERE id = ?'
      ).run(member.id);

      const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(member.id);
      const sports = db
        .prepare('SELECT * FROM member_sports WHERE member_id = ? ORDER BY id')
        .all(member.id);

      return res.json({
        ok: true,
        success: true,
        message: `تردد ثبت شد: ${updated.name}`,
        member: { ...updated, sports },
      });
    } catch (e) {
      console.error('[attendance/scan]', e);
      return res.status(500).json({ ok: false, error: 'Failed to record scan' });
    }
  });

  if (typeof requireAuth === 'function') {
    app.get('/attendance/today', requireAuth, (_req, res) => {
      try {
        const rows = db
          .prepare(
            `
          SELECT a.id, a.member_id, m.name AS member_name, a.member_code,
                 COALESCE(a.source, 'scanner') AS scan_type,
                 a.attended_at AS scan_time
          FROM attendances a
          LEFT JOIN members m ON m.id = a.member_id
          WHERE date(a.attended_at) = date('now', 'localtime')
          ORDER BY a.attended_at DESC
          LIMIT 200
        `
          )
          .all();
        res.json(rows);
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to list today scans' });
      }
    });

    app.get('/attendance/stats', requireAuth, (_req, res) => {
      try {
        const total = db.prepare('SELECT COUNT(*) AS c FROM members').get().c;
        const today = db
          .prepare(
            "SELECT COUNT(*) AS c FROM attendances WHERE date(attended_at) = date('now', 'localtime')"
          )
          .get().c;
        const active = db
          .prepare("SELECT COUNT(*) AS c FROM members WHERE date(expiry_date) >= date('now')")
          .get().c;
        const expired = db
          .prepare("SELECT COUNT(*) AS c FROM members WHERE date(expiry_date) < date('now')")
          .get().c;
        res.json({
          total_members: total,
          today_scans: today,
          active_members: active,
          expired_members: expired,
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to get stats' });
      }
    });
  }
};
