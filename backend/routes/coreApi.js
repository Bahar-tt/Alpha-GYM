/** Core REST: members, coaches, attendance, sms */
module.exports = function registerCoreApi(app, db, h) {
  const { persistPhoto, createReceipt, todayIso, sendSMS, SMS_SEND_DELAY_MS, delay } = h;

  function resolveCoachFields(coach_id, coach_name) {
    let cid = coach_id != null && coach_id !== '' ? Number(coach_id) : null;
    let cname = coach_name != null ? String(coach_name).trim() : null;
    if (cid) {
      const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(cid);
      if (coach) cname = coach.full_name; else cid = null;
    }
    return { coach_id: cid, coach_name: cname || null };
  }

  app.get('/coaches', (_req, res) => {
    try { res.json(db.prepare('SELECT * FROM coaches ORDER BY id DESC').all()); }
    catch { res.status(500).json({ error: 'Failed to list coaches' }); }
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
    } catch { res.status(500).json({ error: 'Failed to get coach' }); }
  });

  app.post('/coaches', (req, res) => {
    const b = req.body || {};
    if (!b.full_name || !String(b.full_name).trim()) return res.status(400).json({ error: 'نام مربی الزامی است' });
    try {
      const r = db.prepare(`INSERT INTO coaches (full_name, phone, specialty, commission_percent, notes, is_active, has_insurance, insurance_notes, referrer_name, referral_source, training_goal, photo_url)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        String(b.full_name).trim(), b.phone ? String(b.phone).trim() : null, b.specialty ? String(b.specialty).trim() : null,
        Number(b.commission_percent) || 0, b.notes ? String(b.notes).trim() : null, b.is_active === false || b.is_active === 0 ? 0 : 1,
        b.has_insurance ? 1 : 0, b.insurance_notes ? String(b.insurance_notes).trim() : null,
        b.referrer_name ? String(b.referrer_name).trim() : null, b.referral_source ? String(b.referral_source).trim() : null,
        b.training_goal ? String(b.training_goal).trim() : null, persistPhoto(b.photo_url, 'coach'),
      );
      res.status(201).json(db.prepare('SELECT * FROM coaches WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create coach' }); }
  });

  app.put('/coaches/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM coaches WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Coach not found' });
    const b = req.body || {};
    try {
      const photoVal = b.photo_url !== undefined ? (b.photo_url ? persistPhoto(String(b.photo_url), 'coach') : null) : existing.photo_url;
      db.prepare(`UPDATE coaches SET full_name=?, phone=?, specialty=?, commission_percent=?, notes=?, is_active=?,
        has_insurance=?, insurance_notes=?, referrer_name=?, referral_source=?, training_goal=?, photo_url=? WHERE id=?`).run(
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
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update coach' }); }
  });

  app.delete('/coaches/:id', (req, res) => {
    const id = Number(req.params.id);
    try {
      db.prepare('UPDATE members SET coach_id = NULL, coach_name = NULL WHERE coach_id = ?').run(id);
      const r = db.prepare('DELETE FROM coaches WHERE id = ?').run(id);
      if (r.changes === 0) return res.status(404).json({ error: 'Coach not found' });
      res.json({ ok: true });
    } catch { res.status(500).json({ error: 'Failed to delete coach' }); }
  });

  app.get('/members', (_req, res) => {
    try { res.json(db.prepare('SELECT * FROM members ORDER BY id DESC').all()); }
    catch { res.status(500).json({ error: 'Failed to list members' }); }
  });

  app.get('/members/by-code/:code', (req, res) => {
    try {
      const code = String(req.params.code || '').trim();
      if (!code) return res.status(400).json({ error: 'code is required' });
      const row = db.prepare('SELECT * FROM members WHERE personnel_code = ? COLLATE NOCASE').get(code);
      if (!row) return res.status(404).json({ error: 'Member not found' });
      res.json(row);
    } catch { res.status(500).json({ error: 'Failed to lookup member' }); }
  });

  app.get('/members/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: 'Member not found' });
      const attendanceRows = db.prepare('SELECT * FROM attendances WHERE member_id = ? ORDER BY attended_at DESC LIMIT 50').all(id);
      const attendanceCount = row.attendance_count != null ? row.attendance_count : db.prepare('SELECT COUNT(*) AS c FROM attendances WHERE member_id = ?').get(id).c;
      let receipts = [];
      try { receipts = db.prepare('SELECT * FROM receipts WHERE member_id = ? ORDER BY id DESC').all(id); } catch {}
      res.json({ ...row, attendance_count: attendanceCount, recent_attendances: attendanceRows, receipts });
    } catch { res.status(500).json({ error: 'Failed to get member' }); }
  });

  app.post('/members', (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.phone || !b.expiry_date) return res.status(400).json({ error: 'missing fields' });
    const code = b.personnel_code != null ? String(b.personnel_code).trim() : '';
    if (code) {
      const dup = db.prepare('SELECT id FROM members WHERE personnel_code = ? COLLATE NOCASE').get(code);
      if (dup) return res.status(400).json({ error: 'این کد پرسنلی قبلاً ثبت شده است' });
    }
    const cf = resolveCoachFields(b.coach_id, b.coach_name);
    try {
      const photoPath = persistPhoto(b.photo_url, 'member');
      const r = db.prepare(`INSERT INTO members (
        name, phone, expiry_date, weekly_sessions, birthday, personnel_code, coach_name, coach_id,
        attendance_count, membership_type, start_date, monthly_fee, coach_commission_percent,
        has_insurance, insurance_notes, referrer_name, referral_source, training_goal, photo_url, national_id,
        father_name, sport, height_cm, weight_kg
      ) VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        String(b.name).trim(), String(b.phone).trim(), String(b.expiry_date).trim(), Number(b.weekly_sessions) || 0,
        b.birthday ? String(b.birthday).trim() : null, code || null, cf.coach_name, cf.coach_id,
        b.membership_type ? String(b.membership_type).trim() : 'monthly',
        b.start_date ? String(b.start_date).trim() : todayIso(),
        Number(b.monthly_fee) || 0, Number(b.coach_commission_percent) || 0,
        b.has_insurance ? 1 : 0, b.insurance_notes ? String(b.insurance_notes).trim() : null,
        b.referrer_name ? String(b.referrer_name).trim() : null, b.referral_source ? String(b.referral_source).trim() : null,
        b.training_goal ? String(b.training_goal).trim() : null, photoPath,
        b.national_id ? String(b.national_id).trim() : null, b.father_name ? String(b.father_name).trim() : null,
        b.sport ? String(b.sport).trim() : null, b.height_cm != null ? Number(b.height_cm) : null, b.weight_kg != null ? Number(b.weight_kg) : null,
      );
      const row = db.prepare('SELECT * FROM members WHERE id = ?').get(r.lastInsertRowid);
      try { onMemberCreated && onMemberCreated(row); } catch {}
      let receipt = null;
      try {
        receipt = createReceipt({
          member_id: row.id, member_name: row.name, phone: row.phone, type: 'registration',
          amount: Number(row.monthly_fee) || 0, months: 1, membership_type: row.membership_type,
          description: 'ثبت‌نام اولیه عضویت', period_start: row.start_date, period_end: row.expiry_date,
        });
      } catch (e) { console.error('receipt', e); }
      res.status(201).json({ ...row, receipt });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create member' }); }
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
    const cf = b.coach_id !== undefined || b.coach_name !== undefined
      ? resolveCoachFields(b.coach_id !== undefined ? b.coach_id : existing.coach_id, b.coach_name !== undefined ? b.coach_name : existing.coach_name)
      : { coach_id: existing.coach_id, coach_name: existing.coach_name };
    try {
      const photoPath = b.photo_url !== undefined ? (b.photo_url ? persistPhoto(String(b.photo_url), 'member') : null) : existing.photo_url;
      db.prepare(`UPDATE members SET name=?, phone=?, expiry_date=?, weekly_sessions=?, birthday=?, personnel_code=?,
        coach_name=?, coach_id=?, membership_type=?, start_date=?, attendance_count=?,
        monthly_fee=?, coach_commission_percent=?, has_insurance=?, insurance_notes=?,
        referrer_name=?, referral_source=?, training_goal=?, photo_url=?, national_id=?,
        father_name=?, sport=?, height_cm=?, weight_kg=? WHERE id=?`).run(
        b.name != null ? String(b.name).trim() : existing.name,
        b.phone != null ? String(b.phone).trim() : existing.phone,
        b.expiry_date != null ? String(b.expiry_date).trim() : existing.expiry_date,
        b.weekly_sessions != null ? Number(b.weekly_sessions) : existing.weekly_sessions,
        b.birthday !== undefined ? (b.birthday ? String(b.birthday).trim() : null) : existing.birthday,
        b.personnel_code !== undefined ? (b.personnel_code ? String(b.personnel_code).trim() : null) : existing.personnel_code,
        cf.coach_name, cf.coach_id,
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
      if (b._renewal) {
        try {
          receipt = createReceipt({
            member_id: row.id, member_name: row.name, phone: row.phone, type: 'renewal',
            amount: Number(b._renewal.amount) || 0, months: Number(b._renewal.months) || 1,
            membership_type: row.membership_type, description: 'تمدید عضویت',
            period_start: existing.expiry_date, period_end: row.expiry_date,
          });
        } catch (e) { console.error(e); }
      }
      res.json({ ...row, receipt });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update member' }); }
  });

  app.delete('/members/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      db.prepare('DELETE FROM attendances WHERE member_id = ?').run(id);
      const r = db.prepare('DELETE FROM members WHERE id = ?').run(id);
      if (r.changes === 0) return res.status(404).json({ error: 'Member not found' });
      res.json({ ok: true });
    } catch { res.status(500).json({ error: 'Failed to delete member' }); }
  });

  app.post('/attendance', (req, res) => {
    const b = req.body || {};
    try {
      let member = null;
      if (b.member_id) member = db.prepare('SELECT * FROM members WHERE id = ?').get(Number(b.member_id));
      else if (b.personnel_code) member = db.prepare('SELECT * FROM members WHERE personnel_code = ? COLLATE NOCASE').get(String(b.personnel_code).trim());
      if (!member) return res.status(404).json({ error: 'Member not found' });
      db.prepare('INSERT INTO attendances (member_id, personnel_code, source) VALUES (?,?,?)').run(member.id, member.personnel_code || null, b.source || 'manual');
      db.prepare('UPDATE members SET attendance_count = COALESCE(attendance_count,0) + 1 WHERE id = ?').run(member.id);
      const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(member.id);
      res.json({ success: true, member: updated });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to record attendance' }); }
  });

  app.get('/sms/logs', (_req, res) => {
    try { res.json(db.prepare('SELECT * FROM sms_logs ORDER BY id DESC LIMIT 500').all()); }
    catch { res.status(500).json({ error: 'Failed to list sms logs' }); }
  });

  app.post('/sms/send', async (req, res) => {
    const b = req.body || {};
    if (!b.phone || !b.message) return res.status(400).json({ error: 'phone and message required' });
    try {
      const ok = await sendSMS({ member_id: b.member_id != null ? Number(b.member_id) : null, name: b.name || '', phone: String(b.phone).trim(), message: String(b.message).trim() });
      const log = db.prepare('SELECT * FROM sms_logs ORDER BY id DESC LIMIT 1').get();
      res.status(201).json({ success: !!ok, log });
    } catch { res.status(500).json({ error: 'Failed to send SMS' }); }
  });

  app.post('/sms/broadcast', async (req, res) => {
    const { recipients, message } = req.body || {};
    if (!Array.isArray(recipients) || !recipients.length) return res.status(400).json({ error: 'recipients array is required' });
    if (!message || !String(message).trim()) return res.status(400).json({ error: 'message is required' });
    const msg = String(message).trim();
    let successCount = 0, failureCount = 0;
    const details = [];
    for (const recipient of recipients) {
      const phone = recipient?.phone ? String(recipient.phone).trim() : '';
      if (!phone) { failureCount++; details.push({ phone: '', success: false, error: 'missing phone' }); continue; }
      try {
        const ok = await sendSMS({ member_id: recipient.member_id != null ? Number(recipient.member_id) : null, name: recipient.name || '', phone, message: msg });
        if (ok) { successCount++; details.push({ phone, success: true }); }
        else { failureCount++; details.push({ phone, success: false, error: 'send failed' }); }
      } catch (err) {
        failureCount++; details.push({ phone, success: false, error: err instanceof Error ? err.message : 'unknown' });
      }
      await delay(SMS_SEND_DELAY_MS);
    }
    res.json({ success_count: successCount, failure_count: failureCount, total: recipients.length, details });
  });
};

// optional hook if eventService not needed as hard dep
let onMemberCreated;
try { onMemberCreated = require('../services/eventService').onMemberCreated; } catch { onMemberCreated = null; }
