(err) { res.status(500).json({ error: 'Failed to get coach' }); }
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
    const coach = db.prepare('SELECT * FROM 