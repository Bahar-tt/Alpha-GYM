'use strict';

/** Small, testable guards shared by member/personnel create + GET APIs. */

function apiError(status, errorCode, message, extra = {}) {
  return { status, body: { ok: false, error: message, error_code: errorCode, ...extra } };
}

function classifyCreateError(err, fallbackMessage = 'ثبت ناموفق بود') {
  const message = String((err && err.message) || '');
  const code = String((err && err.code) || '');
  if (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return apiError(err.status, 'VALIDATION_ERROR', message || fallbackMessage);
  }
  if (code.includes('SQLITE_CONSTRAINT') || /UNIQUE|قبلاً|تکراری|duplicate/i.test(message)) {
    return apiError(409, 'DUPLICATE', message || 'رکورد تکراری است');
  }
  if (code.startsWith('SQLITE')) {
    return apiError(422, 'DB_ERROR', 'خطای دیتابیس؛ ثبت انجام نشد');
  }
  return apiError(500, 'INTERNAL_ERROR', fallbackMessage);
}

/** Pure builder: no DB access, so pytest can exercise every status branch. */
function buildFingerprintSummary({ subject_type, member, personnel, credential, pending } = {}) {
  if (subject_type === 'personnel') {
    if (!personnel) return null;
    const id = Number(personnel.id);
    const hasFp = Boolean(personnel.fingerprint_id);
    return {
      subject_type: 'personnel',
      subject_id: id,
      status: hasFp ? 'enrolled' : pending ? 'pending' : 'not_enrolled',
      credential_value: hasFp ? String(personnel.fingerprint_id) : null,
      foh_member_id: hasFp
        ? String(personnel.fingerprint_id)
        : pending ? String(pending.foh_member_id || '') : String(800000 + id),
      enrollment_id: pending ? Number(pending.id) : null,
      enrollment_expires_at: pending ? pending.expires_at || null : null,
    };
  }

  if (!member) return null;
  const id = Number(member.id);
  const hasFp = Boolean(credential && credential.value);
  const foh = hasFp
    ? String(credential.value)
    : member.legacy_person_id
      ? String(member.legacy_person_id)
      : pending ? String(pending.foh_member_id || '') : String(900000 + id);
  return {
    subject_type: 'member',
    subject_id: id,
    status: hasFp ? 'enrolled' : pending ? 'pending' : 'not_enrolled',
    credential_value: hasFp ? String(credential.value) : null,
    foh_member_id: foh,
    enrollment_id: pending ? Number(pending.id) : null,
    enrollment_expires_at: pending ? pending.expires_at || null : null,
  };
}

/** DB adapter used by the Express routes; delegates to the pure builder. */
function fingerprintSummary(db, { member_id, personnel_id } = {}) {
  const safeGet = (sql, args) => {
    try {
      return db.prepare(sql).get(...args) || null;
    } catch (_e) {
      return null;
    }
  };

  if (personnel_id != null && Number(personnel_id) > 0) {
    const id = Number(personnel_id);
    const personnel = safeGet('SELECT id, full_name, fingerprint_id FROM personnel WHERE id = ?', [id]);
    if (!personnel) return null;
    const pending = safeGet(
      `SELECT id, foh_member_id, expires_at FROM credential_enrollments
       WHERE personnel_id = ? AND kind = 'finger' AND status = 'pending'
         AND datetime(expires_at) >= datetime('now')
       ORDER BY id DESC LIMIT 1`,
      [id],
    );
    return buildFingerprintSummary({ subject_type: 'personnel', personnel, pending });
  }

  const id = Number(member_id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const member = safeGet('SELECT id, name, member_code, legacy_person_id FROM members WHERE id = ?', [id]);
  if (!member) return null;
  const credential = safeGet(
    `SELECT id, value FROM member_credentials
     WHERE member_id = ? AND kind = 'finger' AND is_active = 1
     ORDER BY id DESC LIMIT 1`,
    [id],
  );
  const pending = safeGet(
    `SELECT id, foh_member_id, expires_at FROM credential_enrollments
     WHERE member_id = ? AND kind = 'finger' AND status = 'pending'
       AND datetime(expires_at) >= datetime('now')
     ORDER BY id DESC LIMIT 1`,
    [id],
  );
  return buildFingerprintSummary({ subject_type: 'member', member, credential, pending });
}

function decideEnrollFailure(row, nowText) {
  if (!row) return apiError(404, 'ENROLLMENT_NOT_FOUND', 'Enrollment not found');
  const status = String(row.status || '');
  if (status !== 'pending') {
    return {
      status: 409,
      action: 'none',
      body: { ok: false, error: `enrollment is ${status}`, error_code: 'ENROLLMENT_NOT_PENDING', status },
    };
  }
  const expires = row.expires_at ? String(row.expires_at) : null;
  if (expires && String(nowText || '') >= expires) {
    return { status: 410, action: 'expire', body: { ok: false, error: 'enrollment expired', error_code: 'ENROLLMENT_EXPIRED' } };
  }
  return { status: 200, action: 'fail', body: { ok: true, enrollment_id: Number(row.id) } };
}

module.exports = {
  apiError,
  classifyCreateError,
  buildFingerprintSummary,
  fingerprintSummary,
  decideEnrollFailure,
};
