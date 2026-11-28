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

/** Professional, user-facing message for each fingerprint state. */
function fingerprintMessage(summary, subject_type) {
  if (!summary) {
    return {
      message: 'اطلاعات اثر انگشت در دسترس نیست، لطفاً دوباره تلاش کنید.',
      message_code: 'FINGERPRINT_UNAVAILABLE',
      tone: 'warning',
    };
  }
  if (summary.status === 'enrolled') {
    return {
      message: 'اثر انگشت ثبت شده و برای ورود آماده است.',
      message_code: 'FINGERPRINT_READY',
      tone: 'success',
    };
  }
  if (summary.status === 'pending') {
    return {
      message: 'در انتظار ثبت اثر انگشت روی دستگاه؛ لطفاً انگشت را روی سنسور قرار دهید.',
      message_code: 'FINGERPRINT_PENDING',
      tone: 'info',
    };
  }
  const who = subject_type === 'personnel' || summary.subject_type === 'personnel' ? 'پرسنل' : 'عضو';
  return {
    message: `اثر انگشتی برای این ${who} ثبت نشده است. لطفاً از گزینهٔ «ثبت اثر انگشت» آغاز کنید تا کد ${summary.foh_member_id || ''} روی دستگاه ذخیره شود.`,
    message_code: 'FINGERPRINT_NOT_ENROLLED',
    tone: 'warning',
  };
}

/** Pure builder: no DB access, so pytest can exercise every status branch. */
function buildFingerprintSummary({ subject_type, member, personnel, credential, pending } = {}) {
  if (subject_type === 'personnel') {
    if (!personnel) return null;
    const id = Number(personnel.id);
    const hasFp = Boolean(personnel.fingerprint_id);
    const out = {
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
    return { ...out, ...fingerprintMessage(out, 'personnel') };
  }

  if (!member) return null;
  const id = Number(member.id);
  const hasFp = Boolean(credential && credential.value);
  const foh = hasFp
    ? String(credential.value)
    : member.legacy_person_id
      ? String(member.legacy_person_id)
      : pending ? String(pending.foh_member_id || '') : String(900000 + id);
  const out = {
    subject_type: 'member',
    subject_id: id,
    status: hasFp ? 'enrolled' : pending ? 'pending' : 'not_enrolled',
    credential_value: hasFp ? String(credential.value) : null,
    foh_member_id: foh,
    enrollment_id: pending ? Number(pending.id) : null,
    enrollment_expires_at: pending ? pending.expires_at || null : null,
  };
  return { ...out, ...fingerprintMessage(out, 'member') };
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

/**
 * Same-day check-in rule:
 * - one check-in per sport per day;
 * - a second check-in is allowed only for a member with at least two sports,
 *   for a different sport, at a different time;
 * - a third check-in or a duplicate sport is always rejected.
 */
function decideCheckInDuplicate({ existing = [], newSport = '', sportCount = 0, newTime = null } = {}) {
  const sport = String(newSport || '').trim();
  const today = (existing || []).filter(Boolean);
  if (!today.length) return { status: 200, action: 'allow', body: { ok: true } };

  const sameSport = today.some((r) => String(r.sport || '').trim() === sport);
  if (sameSport) {
    return {
      status: 409,
      action: 'deny',
      body: {
        ok: false,
        duplicate: true,
        error_code: 'DUPLICATE_CHECKIN_SAME_SPORT',
        error: `ورود ${sport || 'این رشته'} امروز قبلاً ثبت شده است`,
      },
    };
  }
  if (Number(sportCount) < 2 || today.length >= 2) {
    return {
      status: 409,
      action: 'deny',
      body: {
        ok: false,
        duplicate: true,
        error_code: today.length >= 2 ? 'THIRD_CHECKIN' : 'DUPLICATE_CHECKIN_SINGLE_SPORT',
        error: today.length >= 2
          ? 'امروز حداکثر دو ورود مجاز است و آن هم فقط برای دو رشتهٔ مختلف'
          : 'تنها اعضای دو رشتهای میتوانند امروز ورود دوم هم ثبت کنند',
      },
    };
  }
  const last = today[today.length - 1];
  const hourOf = (value) => {
    const ms = value ? Date.parse(String(value)) : NaN;
    return Number.isFinite(ms) ? new Date(ms).getHours() : null;
  };
  const lastHour = hourOf(last && last.at);
  const newHour = hourOf(newTime);
  if (lastHour !== null && newHour !== null && lastHour === newHour) {
    return {
      status: 409,
      action: 'deny',
      body: {
        ok: false,
        duplicate: true,
        error_code: 'CHECKIN_SAME_HOUR',
        error: 'دو ورود یک عضو باید در ساعات مختلف ثبت شود',
      },
    };
  }
  return { status: 200, action: 'allow', body: { ok: true } };
}

module.exports = {
  apiError,
  classifyCreateError,
  buildFingerprintSummary,
  fingerprintMessage,
  fingerprintSummary,
  decideEnrollFailure,
  decideCheckInDuplicate,
};
