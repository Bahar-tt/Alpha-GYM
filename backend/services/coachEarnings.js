const DEFAULT_SHARE_PERCENT = 50;

function normalizeSportName(s) { return String(s || '').trim(); }
function isoDate(d) { return d ? String(d).slice(0, 10) : null; }
function periodOf(d = new Date()) { return d instanceof Date ? d.toISOString().slice(0, 7) : String(d || '').slice(0, 7); }
function canonicalSport(db, sport) {
  const value = normalizeSportName(sport);
  if (!value) return value;
  const row = db.prepare("SELECT sport FROM coach_sports WHERE LOWER(TRIM(sport)) = LOWER(TRIM(?)) LIMIT 1").get(value);
  return row ? row.sport : value;
}
function coachesForSport(db, sport) {
  return db.prepare(`SELECT c.id, c.name, c.phone, c.default_share, cs.sport, cs.commission_percent, cs.commission_amount
    FROM coaches c JOIN coach_sports cs ON cs.coach_id = c.id
    WHERE c.is_active = 1 AND LOWER(TRIM(cs.sport)) = LOWER(TRIM(?)) ORDER BY c.name`).all(sport);
}
function shareForCoach(db, coachId, sport, amount) {
  const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(coachId);
  if (!coach) return { percent: 0, amount: 0, coach: null };
  const sportRow = sport ? db.prepare('SELECT * FROM coach_sports WHERE coach_id = ? AND LOWER(TRIM(sport)) = LOWER(TRIM(?)) LIMIT 1').get(coachId, sport) : null;
  const percent = Number(sportRow?.commission_percent || coach.default_share || DEFAULT_SHARE_PERCENT) || 0;
  const fixed = Number(sportRow?.commission_amount || 0);
  return { percent, amount: fixed > 0 ? fixed : Math.round((Number(amount) || 0) * percent / 100), coach };
}

function earnFromSession(db, sessionId) {
  const s = db.prepare('SELECT * FROM coach_sessions WHERE id = ?').get(Number(sessionId));
  if (!s || s.status !== 'completed' || !s.coach_id) return { ok: false, error: 'جلسه تکمیل‌شده یا مربی معتبر نیست' };
  const existing = db.prepare("SELECT * FROM coach_earnings WHERE source_type='session' AND source_id = ? AND coach_id = ?").get(s.id, s.coach_id);
  if (existing) return { ok: true, earning: existing, duplicate: true };
  const member = s.member_id ? db.prepare('SELECT id, name FROM members WHERE id = ?').get(s.member_id) : null;
  const sport = canonicalSport(db, s.sport || '');
  const ms = member ? db.prepare('SELECT tuition_amount, unit_price FROM member_sports WHERE member_id = ? AND LOWER(TRIM(sport)) = LOWER(TRIM(?)) LIMIT 1').get(member.id, sport) : null;
  const unit = Number(ms?.tuition_amount || ms?.unit_price || 0);
  const calc = shareForCoach(db, s.coach_id, sport, unit);
  const date = isoDate(s.session_date) || isoDate(new Date());
  const info = db.prepare(`INSERT INTO coach_earnings
    (coach_id, member_id, member_name, sport, session_id, source_type, source_id, period, earned_at, unit_price, share_percent, share_basis, gross, net, note)
    VALUES (?, ?, ?, ?, ?, 'session', ?, ?, ?, ?, ?, 'revenue', ?, ?, ?)`)
    .run(s.coach_id, member?.id || null, member?.name || s.member_name || null, sport || null, s.id, s.id, periodOf(date), date, unit, calc.percent, unit, calc.amount, 'جلسه تکمیل‌شده');
  return { ok: true, earning: db.prepare('SELECT * FROM coach_earnings WHERE id = ?').get(info.lastInsertRowid) };
}
function revokeSessionEarnings(db, sessionId) {
  const row = db.prepare("SELECT * FROM coach_earnings WHERE source_type='session' AND source_id = ?").get(Number(sessionId));
  if (!row) return { ok: true, removed: false };
  if (row.settlement_id) return { ok: false, error: 'سهم تسویه‌شده قابل برگشت نیست' };
  db.prepare('DELETE FROM coach_earnings WHERE id = ?').run(row.id);
  return { ok: true, removed: true };
}
function accrueMonthlySalary(db, { coachId, period, amount, note, actor }) {
  const value = Math.round(Number(amount) || 0);
  if (!value || !/^\d{4}-\d{2}$/.test(String(period))) return { ok: false, error: 'حقوق یا دوره نامعتبر است' };
  const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(coachId);
  if (!coach) return { ok: false, error: 'مربی پیدا نشد' };
  const existing = db.prepare("SELECT * FROM coach_earnings WHERE coach_id=? AND period=? AND source_type='salary'").get(coachId, period);
  if (existing) return { ok: true, earning: existing, duplicate: true };
  const day = `${period}-01`;
  const info = db.prepare(`INSERT INTO coach_earnings
    (coach_id, source_type, source_id, period, earned_at, unit_price, share_percent, share_basis, gross, net, note)
    VALUES (?, 'salary', ?, ?, ?, ?, 0, 'fixed', ?, ?, ?)`)
    .run(coachId, Number(`${period.replace('-', '')}01${coachId}`), period, day, value, value, value, note || `حقوق ثابت ${period} — ثبت توسط ${actor || ''}`);
  return { ok: true, earning: db.prepare('SELECT * FROM coach_earnings WHERE id = ?').get(info.lastInsertRowid) };
}
function listAdjustments(db, coachId, period) {
  return db.prepare(`SELECT * FROM coach_adjustments WHERE coach_id = ? ${period ? 'AND period = ?' : ''} ORDER BY id DESC`).all(...(period ? [coachId, period] : [coachId]));
}
function addAdjustment(db, { coachId, period, kind, amount, reason, actor }) {
  const k = ['bonus', 'deduction'].includes(String(kind)) ? String(kind) : null;
  const value = Math.round(Number(amount) || 0);
  if (!k || !/^\d{4}-\d{2}$/.test(String(period)) || value <= 0) return { ok: false, error: 'نوع، دوره یا مبلغ تعدیل نامعتبر است' };
  const info = db.prepare('INSERT INTO coach_adjustments (coach_id, period, kind, amount, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(coachId, period, k, value, reason ? String(reason).trim() : null, actor || null);
  return { ok: true, id: info.lastInsertRowid, adjustment: db.prepare('SELECT * FROM coach_adjustments WHERE id=?').get(info.lastInsertRowid) };
}
function deleteAdjustment(db, id) {
  const row = db.prepare('SELECT * FROM coach_adjustments WHERE id = ?').get(Number(id));
  if (!row) return { ok: false, error: 'تعدیل پیدا نشد' };
  db.prepare('DELETE FROM coach_adjustments WHERE id = ?').run(row.id);
  return { ok: true, deleted: row };
}
function settleCoach(db, { coachId, period, note, actor }) {
  const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(coachId);
  if (!coach) return { ok: false, error: 'مربی پیدا نشد' };
  const p = String(period).slice(0, 7);
  const pending = db.prepare("SELECT * FROM coach_earnings WHERE coach_id=? AND period=? AND settlement_id IS NULL ORDER BY earned_at,id").all(coachId, p);
  const adj = db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='bonus' THEN amount ELSE 0 END),0) bonus, COALESCE(SUM(CASE WHEN kind='deduction' THEN amount ELSE 0 END),0) deductions FROM coach_adjustments WHERE coach_id=? AND period=?").get(coachId, p);
  const gross = pending.reduce((s, r) => s + Number(r.net || 0), 0);
  const net = gross + Number(adj.bonus || 0) - Number(adj.deductions || 0);
  if (!pending.length && !adj.bonus && !adj.deductions) return { ok: false, error: 'موردی برای تسویه وجود ندارد' };
  const result = db.transaction(() => {
    const info = db.prepare(`INSERT INTO coach_settlements (coach_id, period, amount, note, settled_by) VALUES (?, ?, ?, ?, ?)`).run(coachId, p, net, note || null, actor || null);
    const sid = Number(info.lastInsertRowid);
    const item = db.prepare('INSERT INTO settlement_items (settlement_id, earning_id, amount) VALUES (?, ?, ?)');
    const mark = db.prepare('UPDATE coach_earnings SET settlement_id=? WHERE id=?');
    pending.forEach((r) => { item.run(sid, r.id, r.net); mark.run(sid, r.id); });
    return sid;
  })();
  return { ok: true, settlement_id: result, settlement: { id: result, period: p, coach_id: coachId, net }, period: p, coach_id: coachId, gross, bonuses: Number(adj.bonus || 0), deductions: Number(adj.deductions || 0), net, items: pending.length };
}
function settlementDetail(db, id) {
  const settlement = db.prepare('SELECT * FROM coach_settlements WHERE id=?').get(Number(id));
  if (!settlement) return null;
  const coach = db.prepare('SELECT * FROM coaches WHERE id=?').get(settlement.coach_id);
  const items = db.prepare('SELECT e.* FROM settlement_items si JOIN coach_earnings e ON e.id=si.earning_id WHERE si.settlement_id=? ORDER BY e.earned_at,e.id').all(settlement.id);
  const adjustments = listAdjustments(db, settlement.coach_id, settlement.period);
  return { settlement, coach, items, adjustments };
}
function cancelSettlement(db, id) {
  const s = db.prepare('SELECT * FROM coach_settlements WHERE id=?').get(Number(id));
  if (!s) return { ok: false, error: 'تسویه پیدا نشد' };
  db.transaction(() => { db.prepare('UPDATE coach_earnings SET settlement_id=NULL WHERE settlement_id=?').run(s.id); db.prepare('DELETE FROM settlement_items WHERE settlement_id=?').run(s.id); db.prepare('DELETE FROM coach_settlements WHERE id=?').run(s.id); })();
  return { ok: true, cancelled: s };
}
function summarizeCoach(db, coachId, from, to) {
  const row = db.prepare('SELECT COALESCE(SUM(gross),0) gross, COALESCE(SUM(net),0) net, COUNT(*) count FROM coach_earnings WHERE coach_id=? AND earned_at BETWEEN ? AND ?').get(coachId, from, to);
  return { gross: Number(row.gross) || 0, net: Number(row.net) || 0, count: Number(row.count) || 0 };
}
function coachProfitability(db, from, to) { return db.prepare(`SELECT c.id coach_id,c.name coach_name,COALESCE(SUM(e.gross),0) gross,COALESCE(SUM(e.net),0) net,COUNT(e.id) items FROM coaches c LEFT JOIN coach_earnings e ON e.coach_id=c.id AND e.earned_at BETWEEN ? AND ? GROUP BY c.id ORDER BY net DESC`).all(from, to); }
function sportProfitability(db, from, to) { return db.prepare(`SELECT COALESCE(sport,'نامشخص') sport,COALESCE(SUM(gross),0) gross,COALESCE(SUM(net),0) net,COUNT(*) items FROM coach_earnings WHERE earned_at BETWEEN ? AND ? GROUP BY sport ORDER BY net DESC`).all(from, to); }
function forecastMonth(db, coachId, period) { const p = String(period || periodOf()).slice(0,7); const row = db.prepare("SELECT COALESCE(SUM(net),0) accrued,COUNT(*) items FROM coach_earnings WHERE coach_id=? AND period=? AND settlement_id IS NULL").get(coachId,p); return { period:p, accrued:Number(row.accrued)||0, items:Number(row.items)||0 }; }
function planUtilization(db, memberId) { return db.prepare('SELECT * FROM member_sports WHERE member_id=? ORDER BY id').all(memberId); }
function setSessionSplits() { return { ok: false, error: 'تقسیم جلسه در این نسخه فعال نیست' }; }
function getSessionSplits() { return []; }

module.exports = { DEFAULT_SHARE_PERCENT, normalizeSportName, canonicalSport, coachesForSport, isoDate, periodOf, earnFromSession, revokeSessionEarnings, accrueMonthlySalary, summarizeCoach, setSessionSplits, getSessionSplits, addAdjustment, deleteAdjustment, listAdjustments, settleCoach, settlementDetail, cancelSettlement, coachProfitability, sportProfitability, forecastMonth, planUtilization };
