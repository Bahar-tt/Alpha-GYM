'use strict';

/** Personnel registry, attendance, leave and fingerprint-agent API. */
module.exports = function registerPersonnelAttendance(app, db, deps) {
  const { requireAuth, requireAdmin, audit } = deps;
  const LEAVE_TYPES = new Set(['annual', 'sick', 'unpaid', 'mission']);
  const STATUSES = new Set(['present', 'absent', 'mission', 'holiday', 'leave']);

  db.exec(`
    CREATE TABLE IF NOT EXISTS personnel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      personnel_type TEXT NOT NULL DEFAULT 'other',
      phone TEXT,
      national_id TEXT,
      fingerprint_id TEXT UNIQUE,
      coach_id INTEGER,
      staff_id INTEGER,
      attendance_enabled INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_personnel_active ON personnel(is_active, attendance_enabled);
    CREATE INDEX IF NOT EXISTS idx_personnel_type ON personnel(personnel_type);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_coach ON personnel(coach_id) WHERE coach_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_staff ON personnel(staff_id) WHERE staff_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS personnel_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      personnel_id INTEGER NOT NULL,
      work_date TEXT NOT NULL,
      check_in TEXT,
      check_out TEXT,
      status TEXT NOT NULL DEFAULT 'present',
      source TEXT NOT NULL DEFAULT 'manual',
      device_id TEXT,
      note TEXT,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(personnel_id, work_date)
    );
    CREATE INDEX IF NOT EXISTS idx_personnel_attendance_date ON personnel_attendance(work_date);

    CREATE TABLE IF NOT EXISTS personnel_leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      personnel_id INTEGER NOT NULL,
      leave_date TEXT NOT NULL,
      leave_type TEXT NOT NULL DEFAULT 'annual',
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by INTEGER,
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_leaves_active_day
      ON personnel_leaves(personnel_id, leave_date)
      WHERE status IN ('pending', 'approved');
    CREATE INDEX IF NOT EXISTS idx_personnel_leaves_date ON personnel_leaves(leave_date);
  `);

  // Keep existing coaches and secretary accounts visible without creating accounts for coaches.
  db.prepare(`
    INSERT INTO personnel (full_name, personnel_type, phone, coach_id)
    SELECT c.name, 'coach', c.phone, c.id FROM coaches c
    WHERE NOT EXISTS (SELECT 1 FROM personnel p WHERE p.coach_id = c.id)
  `).run();
  db.prepare(`
    INSERT INTO personnel (full_name, personnel_type, staff_id)
    SELECT COALESCE(NULLIF(TRIM(s.full_name), ''), s.username), 'secretary', s.id
    FROM staff s WHERE s.role = 'staff'
      AND NOT EXISTS (SELECT 1 FROM personnel p WHERE p.staff_id = s.id)
  `).run();

  const now = () => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const o = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}` };
  };
  const validDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const validTime = (v) => v == null || (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
  const text = (v, max = 500) => v == null ? null : String(v).trim().slice(0, max) || null;
  const publicPersonnel = (p) => ({ ...p, id: Number(p.id), attendance_enabled: !!p.attendance_enabled, is_active: !!p.is_active });
  const person = (id) => db.prepare('SELECT * FROM personnel WHERE id = ?').get(Number(id));
  const activePerson = (id) => db.prepare('SELECT * FROM personnel WHERE id = ? AND is_active = 1 AND attendance_enabled = 1').get(Number(id));
  const row = (id) => db.prepare(`SELECT a.*, p.full_name, p.personnel_type, p.fingerprint_id FROM personnel_attendance a JOIN personnel p ON p.id=a.personnel_id WHERE a.id=?`).get(Number(id));
  const leaveRow = (id) => db.prepare(`SELECT l.*, p.full_name, p.personnel_type FROM personnel_leaves l JOIN personnel p ON p.id=l.personnel_id WHERE l.id=?`).get(Number(id));

  app.get('/personnel', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM personnel ORDER BY is_active DESC, full_name COLLATE NOCASE').all();
    res.json({ personnel: rows.map(publicPersonnel) });
  });

  app.post('/personnel', requireAuth, requireAdmin, (req, res) => {
    const b = req.body || {};
    const name = text(b.full_name, 120);
    if (!name) return res.status(400).json({ error: 'نام پرسنل الزامی است' });
    try {
      const info = db.prepare(`INSERT INTO personnel (full_name, personnel_type, phone, national_id, fingerprint_id, coach_id, staff_id, attendance_enabled, is_active, notes) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(name, text(b.personnel_type, 40) || 'other', text(b.phone, 40), text(b.national_id, 40), text(b.fingerprint_id, 80), b.coach_id ? Number(b.coach_id) : null, b.staff_id ? Number(b.staff_id) : null, b.attendance_enabled === false ? 0 : 1, b.is_active === false ? 0 : 1, text(b.notes));
      audit(req, 'personnel.create', { entityType: 'personnel', entityId: info.lastInsertRowid });
      res.status(201).json(publicPersonnel(person(info.lastInsertRowid)));
    } catch (e) { res.status(409).json({ error: e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'کد اثر انگشت یا ارتباط انتخاب‌شده تکراری است' : 'ثبت پرسنل ناموفق بود' }); }
  });

  app.put('/personnel/:id', requireAuth, requireAdmin, (req, res) => {
    const existing = person(req.params.id);
    if (!existing) return res.status(404).json({ error: 'پرسنل یافت نشد' });
    const b = req.body || {};
    try {
      db.prepare(`UPDATE personnel SET full_name=?, personnel_type=?, phone=?, national_id=?, fingerprint_id=?, coach_id=?, staff_id=?, attendance_enabled=?, is_active=?, notes=?, updated_at=datetime('now') WHERE id=?`).run(text(b.full_name, 120) || existing.full_name, text(b.personnel_type, 40) || existing.personnel_type, text(b.phone, 40), text(b.national_id, 40), text(b.fingerprint_id, 80), b.coach_id ? Number(b.coach_id) : null, b.staff_id ? Number(b.staff_id) : null, b.attendance_enabled === false ? 0 : 1, b.is_active === false ? 0 : 1, text(b.notes), existing.id);
      audit(req, 'personnel.update', { entityType: 'personnel', entityId: existing.id });
      res.json(publicPersonnel(person(existing.id)));
    } catch (e) { res.status(409).json({ error: 'کد اثر انگشت یا ارتباط انتخاب‌شده تکراری است' }); }
  });

  app.delete('/personnel/:id', requireAuth, requireAdmin, (req, res) => {
    const existing = person(req.params.id);
    if (!existing) return res.status(404).json({ error: 'پرسنل یافت نشد' });
    db.prepare('UPDATE personnel SET is_active=0, attendance_enabled=0, updated_at=datetime(\'now\') WHERE id=?').run(existing.id);
    audit(req, 'personnel.deactivate', { entityType: 'personnel', entityId: existing.id });
    res.json({ ok: true });
  });

  app.get('/personnel-attendance/overview', requireAuth, (req, res) => {
    const n = now(); const from = validDate(req.query.from) ? req.query.from : n.date.slice(0, 8) + '01'; const to = validDate(req.query.to) ? req.query.to : n.date;
    const attendance = db.prepare(`SELECT a.*, p.full_name, p.personnel_type, p.fingerprint_id FROM personnel_attendance a JOIN personnel p ON p.id=a.personnel_id WHERE a.work_date BETWEEN ? AND ? ORDER BY a.work_date DESC, a.id DESC`).all(from, to);
    const leaves = db.prepare(`SELECT l.*, p.full_name, p.personnel_type FROM personnel_leaves l JOIN personnel p ON p.id=l.personnel_id WHERE l.leave_date BETWEEN ? AND ? ORDER BY l.leave_date DESC, l.id DESC`).all(from, to);
    const people = db.prepare('SELECT * FROM personnel WHERE is_active=1 AND attendance_enabled=1 ORDER BY full_name COLLATE NOCASE').all().map(publicPersonnel);
    res.json({ ok: true, today: n.date, today_time: n.time, from, to, personnel: people, attendance, leaves });
  });

  app.get('/personnel-attendance/monthly-report', requireAuth, (req, res) => {
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month : now().date.slice(0, 7);
    const from = `${month}-01`;
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const to = `${month}-${String(lastDay).padStart(2, '0')}`;
    const minutes = (value) => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) return null;
      const [h, m] = String(value).split(':').map(Number); return h * 60 + m;
    };
    const people = db.prepare('SELECT * FROM personnel WHERE is_active=1 AND attendance_enabled=1 ORDER BY full_name COLLATE NOCASE').all();
    const rows = db.prepare(`SELECT * FROM personnel_attendance WHERE work_date BETWEEN ? AND ?`).all(from, to);
    const leaves = db.prepare(`SELECT * FROM personnel_leaves WHERE leave_date BETWEEN ? AND ? AND status='approved'`).all(from, to);
    const report = people.map((p) => {
      const mine = rows.filter((r) => Number(r.personnel_id) === Number(p.id));
      let worked = 0;
      mine.forEach((r) => { const start = minutes(r.check_in); const end = minutes(r.check_out); if (start != null && end != null) worked += end >= start ? end - start : (24 * 60 - start) + end; });
      const myLeaves = leaves.filter((l) => Number(l.personnel_id) === Number(p.id));
      const presentDays = mine.filter((r) => r.status === 'present' && r.check_in).length;
      return { personnel_id: p.id, full_name: p.full_name, personnel_type: p.personnel_type, work_days: presentDays, absent_days: mine.filter((r) => r.status === 'absent').length, leave_days: myLeaves.length, total_work_minutes: worked, total_work_hours: Number((worked / 60).toFixed(2)), average_work_minutes: presentDays ? Math.round(worked / presentDays) : 0, incomplete_days: mine.filter((r) => r.check_in && !r.check_out).length };
    });
    const totalMinutes = report.reduce((sum, r) => sum + r.total_work_minutes, 0);
    res.json({ ok: true, month, from, to, report, totals: { personnel: report.length, total_work_minutes: totalMinutes, total_work_hours: Number((totalMinutes / 60).toFixed(2)), work_days: report.reduce((s, r) => s + r.work_days, 0), leave_days: report.reduce((s, r) => s + r.leave_days, 0) } });
  });

  app.post('/personnel-attendance/manual', requireAuth, (req, res) => {
    const b = req.body || {}; const p = activePerson(b.personnel_id); const workDate = validDate(b.work_date) ? b.work_date : now().date;
    if (!p) return res.status(404).json({ error: 'پرسنل فعال و مشمول حضور و غیاب یافت نشد' });
    if (!validTime(b.check_in) || !validTime(b.check_out)) return res.status(400).json({ error: 'ساعت معتبر نیست' });
    const status = STATUSES.has(b.status) ? b.status : 'present'; const existing = db.prepare('SELECT id FROM personnel_attendance WHERE personnel_id=? AND work_date=?').get(p.id, workDate);
    if (existing) db.prepare(`UPDATE personnel_attendance SET check_in=?, check_out=?, status=?, source='manual', note=?, updated_by=?, updated_at=datetime('now') WHERE id=?`).run(text(b.check_in, 5), text(b.check_out, 5), status, text(b.note), req.staff.id, existing.id);
    else db.prepare(`INSERT INTO personnel_attendance (personnel_id,work_date,check_in,check_out,status,source,note,created_by,updated_by) VALUES (?,?,?,?,?,'manual',?,?,?)`).run(p.id, workDate, text(b.check_in, 5), text(b.check_out, 5), status, text(b.note), req.staff.id, req.staff.id);
    const id = existing ? existing.id : db.prepare('SELECT id FROM personnel_attendance WHERE personnel_id=? AND work_date=?').get(p.id, workDate).id;
    audit(req, 'personnel_attendance.manual', { entityType: 'personnel_attendance', entityId: id }); res.json(row(id));
  });

  app.post('/personnel-leaves', requireAuth, (req, res) => {
    const b = req.body || {}; const p = person(b.personnel_id); const date = validDate(b.leave_date) ? b.leave_date : null; const type = LEAVE_TYPES.has(b.leave_type) ? b.leave_type : 'annual';
    if (!p || !p.is_active || !p.attendance_enabled) return res.status(404).json({ error: 'پرسنل مشمول یافت نشد' });
    if (!date) return res.status(400).json({ error: 'تاریخ مرخصی معتبر نیست' });
    const status = req.staff.role === 'admin' && b.status === 'approved' ? 'approved' : 'pending';
    try {
      const info = db.prepare('INSERT INTO personnel_leaves (personnel_id,leave_date,leave_type,reason,status,created_by,reviewed_by,reviewed_at) VALUES (?,?,?,?,?,?,?,?)').run(p.id, date, type, text(b.reason), status, req.staff.id, status === 'approved' ? req.staff.id : null, status === 'approved' ? new Date().toISOString() : null);
      audit(req, 'personnel_leave.create', { entityType: 'personnel_leave', entityId: info.lastInsertRowid }); res.status(201).json(leaveRow(info.lastInsertRowid));
    } catch { res.status(409).json({ error: 'برای این روز قبلاً مرخصی ثبت شده است' }); }
  });

  app.put('/personnel-leaves/:id/status', requireAuth, requireAdmin, (req, res) => {
    const status = ['approved', 'rejected'].includes(req.body?.status) ? req.body.status : null; const existing = leaveRow(req.params.id);
    if (!status || !existing) return res.status(400).json({ error: 'درخواست مرخصی معتبر نیست' });
    db.prepare('UPDATE personnel_leaves SET status=?, reviewed_by=?, reviewed_at=? WHERE id=?').run(status, req.staff.id, new Date().toISOString(), existing.id);
    audit(req, `personnel_leave.${status}`, { entityType: 'personnel_leave', entityId: existing.id }); res.json(leaveRow(existing.id));
  });

  // Fingerprint/card agent: POST with X-Agent-Key and { fingerprint_id, event: check_in|check_out, device_id }.
  app.post('/personnel-attendance/scan', (req, res) => {
    const expected = process.env.PERSONNEL_AGENT_KEY || process.env.AGENT_KEY;
    const supplied = req.get('X-Agent-Key') || req.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!expected || supplied !== expected) return res.status(401).json({ ok: false, error: 'اعتبار دستگاه نامعتبر است' });
    const p = db.prepare('SELECT * FROM personnel WHERE fingerprint_id=? AND is_active=1 AND attendance_enabled=1').get(text(req.body?.fingerprint_id, 80));
    if (!p) return res.status(404).json({ ok: false, error: 'اثر انگشت به پرسنل فعال متصل نیست' });
    const n = now(); const event = ['check_in', 'check_out'].includes(req.body?.event) ? req.body.event : null; const existing = db.prepare('SELECT * FROM personnel_attendance WHERE personnel_id=? AND work_date=?').get(p.id, n.date);
    const action = event || (existing?.check_in && !existing?.check_out ? 'check_out' : 'check_in');
    if (action === 'check_in') {
      if (existing) db.prepare('UPDATE personnel_attendance SET check_in=COALESCE(check_in,?), source=\'fingerprint\', device_id=?, updated_at=datetime(\'now\') WHERE id=?').run(n.time, text(req.body?.device_id, 80), existing.id);
      else db.prepare(`INSERT INTO personnel_attendance (personnel_id,work_date,check_in,status,source,device_id) VALUES (?,?,?,'present','fingerprint',?)`).run(p.id, n.date, n.time, text(req.body?.device_id, 80));
    } else {
      if (!existing?.check_in) return res.status(409).json({ ok: false, error: 'برای امروز ورود ثبت نشده است' });
      db.prepare('UPDATE personnel_attendance SET check_out=COALESCE(check_out,?), source=\'fingerprint\', device_id=?, updated_at=datetime(\'now\') WHERE id=?').run(n.time, text(req.body?.device_id, 80), existing.id);
    }
    const latest = db.prepare('SELECT id FROM personnel_attendance WHERE personnel_id=? AND work_date=?').get(p.id, n.date);
    res.json({ ok: true, action, personnel: publicPersonnel(p), attendance: row(latest.id) });
  });
};
