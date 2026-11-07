'use strict';

/**
 * Staff attendance + monthly leave.
 *
 * This module is intentionally separate from member attendance
 * (`/attendance` / fingerprint). It only touches the `staff` table and the
 * two new tables below, so it cannot change member rows or scan state.
 *
 * Rules implemented:
 *  - One attendance row per staff member per day.
 *  - Secretaries can check in/out themselves.
 *  - Admin can record/edit attendance for any staff member.
 *  - Annual leave quota: 2 days per person per month.
 *  - Pending + approved annual leave both reserve quota (so a secretary cannot
 *    submit 3 requests and wait for approval).
 *  - Sick / unpaid / mission leave is recorded separately and does not use the
 *    2-day annual quota.
 */

module.exports = function registerStaffAttendance(app, db, deps) {
  const { requireAuth, requireAdmin, audit } = deps;

  const ANNUAL_LEAVE_QUOTA = 2;
  const LEAVE_TYPES = new Set(['annual', 'sick', 'unpaid', 'mission']);
  const ATTENDANCE_STATUSES = new Set(['present', 'absent', 'mission', 'holiday']);

  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      work_date TEXT NOT NULL,
      check_in TEXT,
      check_out TEXT,
      status TEXT NOT NULL DEFAULT 'present',
      note TEXT,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(staff_id, work_date)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_staff_attendance_date
      ON staff_attendance(work_date)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      leave_date TEXT NOT NULL,
      leave_type TEXT NOT NULL DEFAULT 'annual',
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by INTEGER,
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Rejected requests do not block a new request for the same day, but an
  // active pending/approved request does.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_leaves_active_day
      ON staff_leaves(staff_id, leave_date)
      WHERE status IN ('pending', 'approved')
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_staff_leaves_date
      ON staff_leaves(leave_date)
  `);

  function tehranNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());

    const out = {};
    for (const part of parts) {
      if (part.type !== 'literal') out[part.type] = part.value;
    }

    let hour = Number(out.hour);
    if (!Number.isFinite(hour) || hour === 24) hour = 0;

    return {
      date: `${out.year}-${out.month}-${out.day}`,
      time: `${String(hour).padStart(2, '0')}:${String(out.minute || '00').padStart(2, '0')}`,
    };
  }

  function isIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }

  function isIsoTime(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  function safeText(value, max = 500) {
    if (value == null) return null;
    const text = String(value).trim();
    if (!text) return null;
    return text.slice(0, max);
  }

  function monthOf(isoDate) {
    return String(isoDate || '').slice(0, 7);
  }

  function displayName(row) {
    if (!row) return '';
    return String(row.full_name || '').trim() || row.username || '';
  }

  function teamRows(req) {
    if (req.staff.role !== 'admin') {
      return [req.staff];
    }
    return db.prepare(`
      SELECT id, username, full_name, role, is_active
      FROM staff
      WHERE role IN ('admin', 'staff')
      ORDER BY is_active DESC, full_name COLLATE NOCASE, username COLLATE NOCASE
    `).all();
  }

  function publicTeam(rows) {
    return (rows || []).map((s) => ({
      id: Number(s.id),
      username: s.username,
      full_name: displayName(s),
      role: s.role,
      is_active: !!s.is_active,
    }));
  }

  function staffExists(staffId) {
    return db.prepare('SELECT id, username, full_name, role, is_active FROM staff WHERE id = ?').get(Number(staffId));
  }

  function activeLeaveForDay(staffId, leaveDate) {
    return db.prepare(`
      SELECT * FROM staff_leaves
      WHERE staff_id = ? AND leave_date = ? AND status IN ('pending', 'approved')
      LIMIT 1
    `).get(Number(staffId), leaveDate);
  }

  function attendanceForDay(staffId, workDate) {
    return db.prepare(
      'SELECT * FROM staff_attendance WHERE staff_id = ? AND work_date = ?'
    ).get(Number(staffId), workDate);
  }

  function annualUsage(staffId, leaveDate, excludeId = null) {
    const params = [Number(staffId), monthOf(leaveDate)];
    let sql = `
      SELECT COUNT(*) AS c FROM staff_leaves
      WHERE staff_id = ? AND substr(leave_date, 1, 7) = ?
        AND leave_type = 'annual' AND status IN ('pending', 'approved')
    `;
    if (excludeId != null) {
      sql += ' AND id != ?';
      params.push(Number(excludeId));
    }
    const row = db.prepare(sql).get(...params);
    return Number(row && row.c) || 0;
  }

  function leaveTypeLabel(type) {
    switch (type) {
      case 'sick': return 'استعلاجی';
      case 'unpaid': return 'بدون حقوق';
      case 'mission': return 'مأموریت';
      default: return 'استحقاقی';
    }
  }

  function upsertLeaveAttendance(leave) {
    const existing = attendanceForDay(leave.staff_id, leave.leave_date);
    const note = `مرخصی ${leaveTypeLabel(leave.leave_type)}${leave.reason ? ` — ${leave.reason}` : ''}`;
    if (existing) {
      db.prepare(`
        UPDATE staff_attendance
        SET check_in = NULL, check_out = NULL, status = 'leave', note = ?,
            updated_by = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(note, leave.reviewed_by || leave.created_by || null, existing.id);
    } else {
      db.prepare(`
        INSERT INTO staff_attendance
          (staff_id, work_date, check_in, check_out, status, note, created_by)
        VALUES (?, ?, NULL, NULL, 'leave', ?, ?)
      `).run(
        leave.staff_id,
        leave.leave_date,
        note,
        leave.created_by || leave.reviewed_by || null
      );
    }
  }

  function removeLeaveAttendance(staffId, leaveDate) {
    const otherApproved = db.prepare(`
      SELECT id FROM staff_leaves
      WHERE staff_id = ? AND leave_date = ? AND status = 'approved'
      LIMIT 1
    `).get(Number(staffId), leaveDate);
    if (otherApproved) return;
    db.prepare(`
      DELETE FROM staff_attendance
      WHERE staff_id = ? AND work_date = ? AND status = 'leave'
    `).run(Number(staffId), leaveDate);
  }

  function leaveCanBeTaken(staffId, leaveDate) {
    const att = attendanceForDay(staffId, leaveDate);
    if (!att) return { ok: true };
    if (att.status === 'leave') return { ok: true };
    return {
      ok: false,
      error: 'برای این روز تردد ثبت شده است؛ ابتدا رکورد تردد را حذف یا اصلاح کنید',
    };
  }

  function leaveRowWithNames(id) {
    return db.prepare(`
      SELECT l.*,
             s.username,
             COALESCE(NULLIF(TRIM(s.full_name), ''), s.username) AS staff_name,
             COALESCE(NULLIF(TRIM(rv.full_name), ''), rv.username) AS reviewed_by_name
      FROM staff_leaves l
      JOIN staff s ON s.id = l.staff_id
      LEFT JOIN staff rv ON rv.id = l.reviewed_by
      WHERE l.id = ?
    `).get(Number(id));
  }

  function attendanceRowWithNames(id) {
    return db.prepare(`
      SELECT a.*,
             s.username,
             COALESCE(NULLIF(TRIM(s.full_name), ''), s.username) AS staff_name
      FROM staff_attendance a
      JOIN staff s ON s.id = a.staff_id
      WHERE a.id = ?
    `).get(Number(id));
  }

  // ── Monthly overview ─────────────────────────────────────────────────────
  app.get('/staff-attendance/overview', requireAuth, (req, res) => {
    try {
      const { from, to } = req.query || {};
      if (!isIsoDate(from) || !isIsoDate(to) || String(from) > String(to)) {
        return res.status(400).json({ error: 'بازه تاریخ معتبر نیست' });
      }

      const now = tehranNow();
      const team = teamRows(req);
      const teamPublic = publicTeam(team);
      const ids = teamPublic.map((s) => s.id);
      const placeholders = ids.map(() => '?').join(',');

      const attendance = ids.length
        ? db.prepare(`
            SELECT a.*,
                   s.username,
                   COALESCE(NULLIF(TRIM(s.full_name), ''), s.username) AS staff_name
            FROM staff_attendance a
            JOIN staff s ON s.id = a.staff_id
            WHERE a.work_date BETWEEN ? AND ?
              AND a.staff_id IN (${placeholders})
            ORDER BY a.work_date DESC, a.check_in DESC, a.id DESC
          `).all(from, to, ...ids)
        : [];

      const leaves = ids.length
        ? db.prepare(`
            SELECT l.*,
                   s.username,
                   COALESCE(NULLIF(TRIM(s.full_name), ''), s.username) AS staff_name,
                   COALESCE(NULLIF(TRIM(rv.full_name), ''), rv.username) AS reviewed_by_name
            FROM staff_leaves l
            JOIN staff s ON s.id = l.staff_id
            LEFT JOIN staff rv ON rv.id = l.reviewed_by
            WHERE l.leave_date BETWEEN ? AND ?
              AND l.staff_id IN (${placeholders})
            ORDER BY l.leave_date DESC, l.id DESC
          `).all(from, to, ...ids)
        : [];

      const summary = teamPublic.map((s) => {
        const myAttendance = attendance.filter((a) => Number(a.staff_id) === s.id);
        const myLeaves = leaves.filter((l) => Number(l.staff_id) === s.id);
        const approvedAnnual = myLeaves.filter((l) => l.leave_type === 'annual' && l.status === 'approved').length;
        const pendingAnnual = myLeaves.filter((l) => l.leave_type === 'annual' && l.status === 'pending').length;
        const otherLeave = myLeaves.filter((l) => l.leave_type !== 'annual' && l.status === 'approved').length;
        const todayAttendance = myAttendance.find((a) => a.work_date === now.date) || null;
        const todayLeave = myLeaves.find((l) => l.leave_date === now.date && l.status === 'approved') || null;
        const reserved = approvedAnnual + pendingAnnual;

        return {
          staff_id: s.id,
          staff_name: s.full_name,
          username: s.username,
          role: s.role,
          is_active: s.is_active,
          present_days: myAttendance.filter((a) => a.status === 'present').length,
          absent_days: myAttendance.filter((a) => a.status === 'absent').length,
          mission_days: myAttendance.filter((a) => a.status === 'mission').length,
          holiday_days: myAttendance.filter((a) => a.status === 'holiday').length,
          leave_approved: approvedAnnual,
          leave_pending: pendingAnnual,
          leave_other: otherLeave,
          leave_quota: ANNUAL_LEAVE_QUOTA,
          leave_reserved: reserved,
          leave_remaining: Math.max(0, ANNUAL_LEAVE_QUOTA - reserved),
          today_leave: !!todayLeave,
          today_attendance: todayAttendance,
        };
      });

      const todayAttendance = attendanceForDay(req.staff.id, now.date);
      const todayLeave = db.prepare(`
        SELECT id FROM staff_leaves
        WHERE staff_id = ? AND leave_date = ? AND status = 'approved'
        LIMIT 1
      `).get(req.staff.id, now.date);

      res.json({
        ok: true,
        from,
        to,
        today: now.date,
        today_time: now.time,
        quota: ANNUAL_LEAVE_QUOTA,
        staff: teamPublic,
        attendance,
        leaves,
        summary,
        today_state: {
          attendance: todayAttendance ? attendanceRowWithNames(todayAttendance.id) : null,
          leave: todayLeave ? leaveRowWithNames(todayLeave.id) : null,
        },
      });
    } catch (err) {
      console.error('GET /staff-attendance/overview', err);
      res.status(500).json({ error: 'خطا در دریافت تردد و مرخصی' });
    }
  });

  // ── Self check-in / check-out ────────────────────────────────────────────
  app.post('/staff-attendance/check-in', requireAuth, (req, res) => {
    try {
      const now = tehranNow();
      const approvedLeave = db.prepare(`
        SELECT id, leave_type FROM staff_leaves
        WHERE staff_id = ? AND leave_date = ? AND status = 'approved'
        LIMIT 1
      `).get(req.staff.id, now.date);
      if (approvedLeave) {
        return res.status(409).json({ error: 'امروز برای شما مرخصی تأیید شده ثبت شده است' });
      }

      const existing = attendanceForDay(req.staff.id, now.date);
      if (existing) {
        if (existing.status === 'leave') {
          return res.status(409).json({ error: 'وضعیت امروز مرخصی ثبت شده است' });
        }
        if (existing.check_in) {
          return res.status(409).json({ error: 'ورود امروز قبلاً ثبت شده است' });
        }
        if (existing.check_out) {
          return res.status(409).json({ error: 'خروج امروز قبلاً ثبت شده است؛ رکورد را از مدیر بخواهید اصلاح کند' });
        }
        db.prepare(`
          UPDATE staff_attendance
          SET check_in = ?, status = 'present', updated_by = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(now.time, req.staff.id, existing.id);
        const row = attendanceRowWithNames(existing.id);
        audit(req, 'staff_attendance.check_in', {
          entityType: 'staff_attendance',
          entityId: existing.id,
          detail: { work_date: now.date, check_in: now.time },
        });
        return res.json(row);
      }

      const result = db.prepare(`
        INSERT INTO staff_attendance
          (staff_id, work_date, check_in, check_out, status, note, created_by)
        VALUES (?, ?, ?, NULL, 'present', NULL, ?)
      `).run(req.staff.id, now.date, now.time, req.staff.id);

      const row = attendanceRowWithNames(result.lastInsertRowid);
      audit(req, 'staff_attendance.check_in', {
        entityType: 'staff_attendance',
        entityId: result.lastInsertRowid,
        detail: { work_date: now.date, check_in: now.time },
      });
      res.status(201).json(row);
    } catch (err) {
      console.error('POST /staff-attendance/check-in', err);
      res.status(500).json({ error: 'خطا در ثبت ورود' });
    }
  });

  app.post('/staff-attendance/check-out', requireAuth, (req, res) => {
    try {
      const now = tehranNow();
      const existing = attendanceForDay(req.staff.id, now.date);
      if (!existing || !existing.check_in) {
        return res.status(400).json({ error: 'ابتدا باید ورود امروز ثبت شود' });
      }
      if (existing.status === 'leave') {
        return res.status(400).json({ error: 'وضعیت امروز مرخصی ثبت شده است' });
      }
      if (existing.check_out) {
        return res.status(409).json({ error: 'خروج امروز قبلاً ثبت شده است' });
      }

      db.prepare(`
        UPDATE staff_attendance
        SET check_out = ?, updated_by = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(now.time, req.staff.id, existing.id);

      const row = attendanceRowWithNames(existing.id);
      audit(req, 'staff_attendance.check_out', {
        entityType: 'staff_attendance',
        entityId: existing.id,
        detail: { work_date: now.date, check_out: now.time },
      });
      res.json(row);
    } catch (err) {
      console.error('POST /staff-attendance/check-out', err);
      res.status(500).json({ error: 'خطا در ثبت خروج' });
    }
  });

  // ── Admin: manual attendance ─────────────────────────────────────────────
  app.post('/staff-attendance/manual', requireAuth, requireAdmin, (req, res) => {
    try {
      const body = req.body || {};
      const staffId = Number(body.staff_id);
      const workDate = String(body.work_date || '');
      const status = String(body.status || 'present');
      const checkIn = safeText(body.check_in, 5);
      const checkOut = safeText(body.check_out, 5);
      const note = safeText(body.note, 500);

      if (!staffExists(staffId)) {
        return res.status(400).json({ error: 'کارمند انتخاب‌شده یافت نشد' });
      }
      if (!isIsoDate(workDate)) {
        return res.status(400).json({ error: 'تاریخ تردد معتبر نیست' });
      }
      if (!ATTENDANCE_STATUSES.has(status)) {
        return res.status(400).json({ error: 'وضعیت تردد معتبر نیست' });
      }
      if (checkIn && !isIsoTime(checkIn)) {
        return res.status(400).json({ error: 'ساعت ورود باید به شکل HH:MM باشد' });
      }
      if (checkOut && !isIsoTime(checkOut)) {
        return res.status(400).json({ error: 'ساعت خروج باید به شکل HH:MM باشد' });
      }
      if (checkOut && !checkIn) {
        return res.status(400).json({ error: 'برای ثبت خروج، ساعت ورود هم لازم است' });
      }

      const approvedLeave = db.prepare(`
        SELECT id FROM staff_leaves
        WHERE staff_id = ? AND leave_date = ? AND status = 'approved'
        LIMIT 1
      `).get(staffId, workDate);
      if (approvedLeave) {
        return res.status(409).json({ error: 'برای این روز مرخصی تأیید شده ثبت شده است' });
      }

      const existing = attendanceForDay(staffId, workDate);
      let id;
      if (existing) {
        db.prepare(`
          UPDATE staff_attendance
          SET check_in = ?, check_out = ?, status = ?, note = ?,
              updated_by = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(checkIn, checkOut, status, note, req.staff.id, existing.id);
        id = existing.id;
      } else {
        const result = db.prepare(`
          INSERT INTO staff_attendance
            (staff_id, work_date, check_in, check_out, status, note, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(staffId, workDate, checkIn, checkOut, status, note, req.staff.id, req.staff.id);
        id = result.lastInsertRowid;
      }

      const row = attendanceRowWithNames(id);
      audit(req, 'staff_attendance.manual', {
        entityType: 'staff_attendance',
        entityId: id,
        detail: { staff_id: staffId, work_date: workDate, status, check_in: checkIn, check_out: checkOut },
      });
      res.status(existing ? 200 : 201).json(row);
    } catch (err) {
      console.error('POST /staff-attendance/manual', err);
      res.status(500).json({ error: 'خطا در ثبت دستی تردد' });
    }
  });

  app.delete('/staff-attendance/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = attendanceForDayById(id);
      if (!row) return res.status(404).json({ error: 'رکورد تردد یافت نشد' });
      if (row.status === 'leave') {
        return res.status(400).json({ error: 'رکورد مرخصی را از بخش مرخصی‌ها حذف کنید' });
      }
      db.prepare('DELETE FROM staff_attendance WHERE id = ?').run(id);
      audit(req, 'staff_attendance.delete', {
        entityType: 'staff_attendance',
        entityId: id,
        detail: { staff_id: row.staff_id, work_date: row.work_date },
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /staff-attendance/:id', err);
      res.status(500).json({ error: 'خطا در حذف تردد' });
    }
  });

  function attendanceForDayById(id) {
    return db.prepare('SELECT * FROM staff_attendance WHERE id = ?').get(Number(id));
  }

  // ── Leave requests + admin approval ─────────────────────────────────────
  app.post('/staff-leaves', requireAuth, (req, res) => {
    try {
      const body = req.body || {};
      const isAdmin = req.staff.role === 'admin';
      const staffId = isAdmin && body.staff_id != null ? Number(body.staff_id) : Number(req.staff.id);
      const leaveDate = String(body.leave_date || '');
      const leaveType = String(body.leave_type || 'annual');
      const reason = safeText(body.reason, 500);

      if (!staffExists(staffId)) {
        return res.status(400).json({ error: 'کارمند انتخاب‌شده یافت نشد' });
      }
      if (!isIsoDate(leaveDate)) {
        return res.status(400).json({ error: 'تاریخ مرخصی معتبر نیست' });
      }
      if (!LEAVE_TYPES.has(leaveType)) {
        return res.status(400).json({ error: 'نوع مرخصی معتبر نیست' });
      }
      if (activeLeaveForDay(staffId, leaveDate)) {
        return res.status(409).json({ error: 'برای این روز قبلاً درخواست یا مرخصی ثبت شده است' });
      }
      const canTake = leaveCanBeTaken(staffId, leaveDate);
      if (!canTake.ok) return res.status(409).json({ error: canTake.error });

      if (leaveType === 'annual') {
        const used = annualUsage(staffId, leaveDate);
        if (used >= ANNUAL_LEAVE_QUOTA) {
          return res.status(409).json({
            error: `سهمیه مرخصی استحقاقی این ماه (${ANNUAL_LEAVE_QUOTA} روز) تکمیل شده است`,
          });
        }
      }

      const status = isAdmin && body.status === 'approved' ? 'approved' : 'pending';
      const reviewedBy = status === 'approved' ? req.staff.id : null;
      const result = db.prepare(`
        INSERT INTO staff_leaves
          (staff_id, leave_date, leave_type, reason, status, created_by, reviewed_by, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        staffId,
        leaveDate,
        leaveType,
        reason,
        status,
        req.staff.id,
        reviewedBy,
        reviewedBy ? new Date().toISOString() : null
      );

      const row = leaveRowWithNames(result.lastInsertRowid);
      if (status === 'approved') upsertLeaveAttendance(row);

      audit(req, 'staff_leave.create', {
        entityType: 'staff_leave',
        entityId: row.id,
        detail: { staff_id: staffId, leave_date: leaveDate, leave_type: leaveType, status },
      });
      res.status(201).json(row);
    } catch (err) {
      if (err && /UNIQUE constraint failed/.test(String(err.message))) {
        return res.status(409).json({ error: 'برای این روز قبلاً درخواست یا مرخصی ثبت شده است' });
      }
      console.error('POST /staff-leaves', err);
      res.status(500).json({ error: 'خطا در ثبت مرخصی' });
    }
  });

  app.put('/staff-leaves/:id/status', requireAuth, requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare('SELECT * FROM staff_leaves WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: 'درخواست مرخصی یافت نشد' });

      const status = String((req.body || {}).status || '');
      if (status !== 'approved' && status !== 'rejected') {
        return res.status(400).json({ error: 'وضعیت باید approved یا rejected باشد' });
      }

      if (status === 'approved') {
        const canTake = leaveCanBeTaken(row.staff_id, row.leave_date);
        if (!canTake.ok) return res.status(409).json({ error: canTake.error });
        if (row.leave_type === 'annual') {
          const used = annualUsage(row.staff_id, row.leave_date, row.id);
          if (used >= ANNUAL_LEAVE_QUOTA) {
            return res.status(409).json({
              error: `سهمیه مرخصی استحقاقی این ماه (${ANNUAL_LEAVE_QUOTA} روز) تکمیل شده است`,
            });
          }
        }
      }

      db.prepare(`
        UPDATE staff_leaves
        SET status = ?, reviewed_by = ?, reviewed_at = ?
        WHERE id = ?
      `).run(status, req.staff.id, new Date().toISOString(), id);

      const updated = leaveRowWithNames(id);
      if (status === 'approved') {
        upsertLeaveAttendance(updated);
      } else {
        removeLeaveAttendance(updated.staff_id, updated.leave_date);
      }

      audit(req, `staff_leave.${status === 'approved' ? 'approve' : 'reject'}`, {
        entityType: 'staff_leave',
        entityId: id,
        detail: { staff_id: updated.staff_id, leave_date: updated.leave_date },
      });
      res.json(updated);
    } catch (err) {
      console.error('PUT /staff-leaves/:id/status', err);
      res.status(500).json({ error: 'خطا در تغییر وضعیت مرخصی' });
    }
  });

  app.delete('/staff-leaves/:id', requireAuth, (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare('SELECT * FROM staff_leaves WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: 'درخواست مرخصی یافت نشد' });

      const isAdmin = req.staff.role === 'admin';
      if (!isAdmin && (Number(row.staff_id) !== Number(req.staff.id) || row.status !== 'pending')) {
        return res.status(403).json({ error: 'فقط درخواست در انتظار خودتان را می‌توانید لغو کنید' });
      }

      db.prepare('DELETE FROM staff_leaves WHERE id = ?').run(id);
      removeLeaveAttendance(row.staff_id, row.leave_date);
      audit(req, 'staff_leave.delete', {
        entityType: 'staff_leave',
        entityId: id,
        detail: { staff_id: row.staff_id, leave_date: row.leave_date, status: row.status },
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /staff-leaves/:id', err);
      res.status(500).json({ error: 'خطا در حذف مرخصی' });
    }
  });
};
