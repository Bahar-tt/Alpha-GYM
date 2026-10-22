/**
 * Endpoint for desktop fingerprint/card agent.
 * POST /attendance/scan
 * Body: { member_code | personnel_code | uid, device_id?, source?, scan_time? }
 */
module.exports = function registerAttendanceScan(app, db) {
  app.post('/attendance/scan', (req, res) => {
    const b = req.body || {};
    const code = String(
      b.personnel_code || b.member_code || b.uid || b.code || ''
    ).trim();

    if (!code) {
      return res.status(400).json({ ok: false, error: 'member_code is required' });
    }

    try {
      // 1) کد پرسنلی
      let member = db
        .prepare('SELECT * FROM members WHERE personnel_code = ? COLLATE NOCASE')
        .get(code);

      // 2) اگر فقط عدد بود، id
      if (!member && /^\d+$/.test(code)) {
        member = db.prepare('SELECT * FROM members WHERE id = ?').get(Number(code));
      }

      // 3) جستجوی جزئی روی کد پرسنلی (کارت کوتاه)
      if (!member) {
        member = db
          .prepare(
            "SELECT * FROM members WHERE personnel_code IS NOT NULL AND (personnel_code LIKE ? OR ? LIKE '%' || personnel_code || '%') COLLATE NOCASE LIMIT 1"
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

      const source = b.source || b.device_id || 'scanner';
      const attendedAt =
        b.scan_time && !Number.isNaN(Date.parse(b.scan_time))
          ? new Date(b.scan_time).toISOString()
          : null;

      if (attendedAt) {
        db.prepare(
          'INSERT INTO attendances (member_id, personnel_code, attended_at, source) VALUES (?,?,?,?)'
        ).run(member.id, member.personnel_code || code, attendedAt, source);
      } else {
        db.prepare(
          'INSERT INTO attendances (member_id, personnel_code, source) VALUES (?,?,?)'
        ).run(member.id, member.personnel_code || code, source);
      }

      db.prepare(
        'UPDATE members SET attendance_count = COALESCE(attendance_count, 0) + 1 WHERE id = ?'
      ).run(member.id);

      const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(member.id);

      return res.json({
        ok: true,
        success: true,
        message: `تردد ثبت شد: ${updated.name}`,
        member: updated,
      });
    } catch (e) {
      console.error('[attendance/scan]', e);
      return res.status(500).json({ ok: false, error: 'Failed to record scan' });
    }
  });

  // سلامت ایجنت
  app.get('/attendance/scan/health', (_req, res) => {
    res.json({ ok: true, endpoint: '/attendance/scan', mode: 'local' });
  });
};
