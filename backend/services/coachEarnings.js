/**
 * coachEarnings.js — موتور سهم مربی
 *
 * منبع واحد حقیقت برای «بدهی باشگاه به مربی».
 *
 * اصول:
 *  ۱) هر سطر coach_earnings یک سهم مستقل و قابل ردیابی است
 *  ۲) نرخ و درصد در لحظه اسنپ‌شات می‌شوند (تغییر تعرفه، سوابق قبلی را خراب نمی‌کند)
 *  ۳) UNIQUE(source_type, source_id, coach_id) ⇒ ثبت دوباره یک جلسه، پول اضافه نمی‌سازد
 *  ۴) تسویه per-row ⇒ تسویه جزئی دقیق و قابل ممیزی
 *  ۵) داده immutable: اصلاح یعنی برگرداندن سطر قبلی + ساخت سطر جدید
 */

const DEFAULT_SHARE_PERCENT = 50;

// تاریخ‌ها در کل دیتابیس میلادی ISO هستند؛ فقط «دوره» به ماه خلاصه می‌شود.
function isoDate(d = new Date()) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function isoDateTime(d = new Date()) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}

function periodOf(dateLike) {
  return isoDate(dateLike).slice(0, 7); // YYYY-MM
}

function clampMoney(n) {
  const v = Math.round(Number(n) || 0);
  return Number.isFinite(v) ? v : 0;
}

/**
 * نرخ واحد قابل اتکا برای جلسه.
 *
 * اولویت‌ها (از دقیق‌ترین/قابل‌اعتمادترین به کم‌اعتبارترین):
 *  ۱) نرخ اسنپ‌شده روی خودِ جلسه  — اگر قبلاً محاسبه شده، همان ملاک است (تغییر تعرفه
 *     سوابق را خراب نمی‌کند؛ برای بازمحاسبه عمداً پاک می‌شود)
 *  ۲) تعرفهٔ فعلی پلنِ انتخابی عضو  (sport_plan_id → price ÷ sessions)
 *  ۳) قیمت کل ÷ تعداد جلسات       (عضوی که پلن ندارد یا پلنش عوض شده)
 *  ۴) مبلغ ثابت ساعتی روی قرارداد مربی (coach_sports.hourly_rate)
 *
 * نکته: unit_price روی member_sessions فقط «کش محاسباتی» است، نه منبع حقیقت —
 * عمداً آخر از قیمت پلن خوانده می‌شود تا تغییر تعرفه قابل اعمال باشد.
 *
 * @returns {number}
 */
function resolveUnitPrice(db, { memberSession, session, coachId, sport }) {
  // ۱) نرخ قطعی همان جلسه
  const sessionSnap = Number(session && session.unit_price) || 0;
  if (sessionSnap > 0) return sessionSnap;

  // ۲) تعرفه فعلی پلن انتخابی عضو
  const planId = memberSession && memberSession.sport_plan_id;
  if (planId) {
    const plan = db.prepare('SELECT sessions, price FROM sport_plans WHERE id = ?').get(Number(planId));
    if (plan && Number(plan.price) > 0 && Number(plan.sessions) > 0) {
      return clampMoney(plan.price / plan.sessions);
    }
  }

  // ۳) قیمت کل عضویت تقسیم بر جلسات
  const tuition = Number(memberSession && memberSession.tuition_amount) || 0;
  const sessions = Number(memberSession && memberSession.total_sessions) || 0;
  if (tuition > 0 && sessions > 0) return clampMoney(tuition / sessions);

  // ۴) مبلغ ثابت ساعتی مربی
  const hourly = db.prepare(
    'SELECT hourly_rate FROM coach_sports WHERE coach_id = ? AND sport = ? LIMIT 1'
  ).get(Number(coachId) || 0, String(sport || ''));
  if (hourly && Number(hourly.hourly_rate) > 0) return clampMoney(hourly.hourly_rate);

  return 0;
}

/**
 * درصد سهم مربی.
 * اولویت: قرارداد مربی برای همان رشته → پیش‌فرض مربی → ۵۰٪ سراسری
 */
function resolveSharePercent(db, { coachId, sport }) {
  const row = db.prepare(
    'SELECT share_percent FROM coach_sports WHERE coach_id = ? AND sport = ? LIMIT 1'
  ).get(Number(coachId) || 0, String(sport || ''));
  if (row && row.share_percent != null) return clampMoney(row.share_percent);

  const coach = db.prepare('SELECT default_share FROM coaches WHERE id = ?').get(Number(coachId) || 0);
  if (coach && Number(coach.default_share) > 0) return clampMoney(coach.default_share);

  return DEFAULT_SHARE_PERCENT;
}

/** باشگاه چند درصد پول جلسه را نگه می‌دارد؟ */
function gymSharePercent(db, { sport }) {
  const row = db.prepare(
    'SELECT gym_percent FROM coach_sports WHERE sport = ? AND gym_percent IS NOT NULL LIMIT 1'
  ).get(String(sport || ''));
  return row && row.gym_percent != null ? clampMoney(row.gym_percent) : 0;
}

/**
 * ساخت (یا بازیابی) سهم مربی برای یک جلسه.
 *
 * این تابع idempotent است: فراخوانی دوباره همان جلسه، سطر جدید نمی‌سازد.
 *
 * @param {object} db
 * @param {number} sessionId
 * @returns {{ ok: boolean, earning?: object, reason?: string }}
 */
function earnFromSession(db, sessionId) {
  const sid = Number(sessionId);
  if (!sid) return { ok: false, reason: 'INVALID_SESSION' };

  const session = db.prepare('SELECT * FROM coach_sessions WHERE id = ?').get(sid);
  if (!session) return { ok: false, reason: 'SESSION_NOT_FOUND' };
  if (session.status !== 'completed') return { ok: false, reason: 'NOT_COMPLETED' };

  // مربیِ صاحب جلسه. اگر جلسه تقسیم شده باشد، همه سهم‌کنندگان حق دارند.
  const splits = db.prepare(
    'SELECT coach_id, share_percent FROM coach_session_splits WHERE session_id = ? ORDER BY id'
  ).all(sid);

  const participants = splits.length
    ? splits
    : [{ coach_id: Number(session.coach_id), share_percent: 100 }];

  const member = session.member_id
    ? db.prepare('SELECT id, name, sport FROM members WHERE id = ?').get(Number(session.member_id))
    : null;

  // رشته: از جلسه، وگرنه از عضو، وگرنه از نخستین رشته‌ی عضو
  let sport = session.sport || (member && member.sport) || null;
  if (!sport && member) {
    const ms = db.prepare('SELECT sport FROM member_sports WHERE member_id = ? LIMIT 1').get(member.id);
    sport = ms ? ms.sport : null;
  }

  // رشته‌ی عضو برای جلسه‌ی فعلی: اگر جلسه رشته دارد، همان؛ وگرنه اولین رشته
  const memberSession = session.member_id
    ? (sport
      ? db.prepare('SELECT * FROM member_sports WHERE member_id = ? AND sport = ? ORDER BY id LIMIT 1')
        .get(Number(session.member_id), String(sport))
      : null)
    || db.prepare('SELECT * FROM member_sports WHERE member_id = ? ORDER BY id LIMIT 1').get(Number(session.member_id))
    : null;

  const unitPrice = resolveUnitPrice(db, { memberSession, session, coachId: session.coach_id, sport });
  const baseSharePercent = resolveSharePercent(db, { coachId: session.coach_id, sport });
  const gymPercent = gymSharePercent(db, { sport });

  const period = periodOf(session.session_date || isoDate());
  const earnedAt = isoDate(session.session_date || new Date());
  const duration = Number(session.duration_minutes) || 60;

  const ins = db.prepare(`
    INSERT OR IGNORE INTO coach_earnings
      (coach_id, member_id, member_name, sport, session_id, source_type, source_id,
       period, earned_at, unit_price, share_percent, share_basis, gross, net, note)
    VALUES (?, ?, ?, ?, ?, 'session', ?, ?, ?, ?, ?, 'revenue', ?, ?, ?)
  `);

  const insRevenue = db.prepare(`
    INSERT OR IGNORE INTO session_revenue
      (session_id, member_id, member_name, sport, coach_id, unit_price,
       gross_revenue, coach_share, gym_share, share_percent, period, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const markSession = db.prepare('UPDATE coach_sessions SET share_percent = ?, coach_share_amount = ?, earnings_id = ? WHERE id = ?');

  const out = { ok: true, earnings: [], unit_price: unitPrice, share_percent: baseSharePercent, sport };

  const run = db.transaction(() => {
    for (const p of participants) {
      const coachId = Number(p.coach_id);
      if (!coachId) continue;

      // اگر جلسه بین چند مربی تقسیم شده، درصدِ مشارکت‌کننده روی سهم پایه ضرب می‌شود.
      const splitPct = p.share_percent == null ? 100 : clampMoney(p.share_percent);
      const effectiveShare = Math.round((baseSharePercent * splitPct) / 100);

      const gross = clampMoney((unitPrice * effectiveShare) / 100);
      const note = splits.length
        ? `جلسه ${sid} — ${sport || ''} — ${duration} دقیقه (${splitPct}٪ تقسیم)`
        : `جلسه ${sid} — ${sport || ''} — ${duration} دقیقه`;

      const res = ins.run(
        coachId,
        session.member_id ? Number(session.member_id) : null,
        member ? member.name : null,
        sport,
        sid,
        sid,
        period,
        earnedAt,
        unitPrice,
        effectiveShare,
        gross,
        gross,
        note
      );

      if (res.changes > 0) {
        const earning = db.prepare('SELECT * FROM coach_earnings WHERE id = ?').get(res.lastInsertRowid);
        out.earnings.push(earning);
        if (!session.earnings_id && coachId === Number(session.coach_id)) {
          markSession.run(effectiveShare, gross, res.lastInsertRowid, sid);
        }
      } else {
        // سطر از قبل موجود بود (idempotent) — همان را برمی‌گردانیم
        const existing = db.prepare(
          "SELECT * FROM coach_earnings WHERE source_type = 'session' AND source_id = ? AND coach_id = ?"
        ).get(sid, coachId);
        if (existing) out.earnings.push(existing);
      }
    }

    // سهم باشگاه فقط برای مربیِ اصلی جلسه یک‌بار ثبت می‌شود
    if (gymPercent > 0 && Number(session.coach_id)) {
      const gymAmount = clampMoney((unitPrice * gymPercent) / 100);
      const rev = insRevenue.run(
        sid,
        session.member_id ? Number(session.member_id) : null,
        member ? member.name : null,
        sport,
        Number(session.coach_id),
        unitPrice,
        unitPrice,
        clampMoney((unitPrice * baseSharePercent) / 100),
        gymAmount,
        baseSharePercent,
        period,
        earnedAt
      );
      if (rev.changes === 0) {
        // از قبل ثبت شده — نگه می‌داریم (بدون خطا)
      }
    }
  });

  run();
  return out;
}

/**
 * حذف سهم‌های یک جلسه (وقتی جلسه کنسل شد یا از completed خارج شد).
 * سطرهای تسویه‌شده دست‌نخورده می‌مانند تا تاریخچه مالی نشکند.
 *
 * @returns {{ ok: boolean, removed: number, skipped_settled: number }}
 */
function revokeSessionEarnings(db, sessionId) {
  const sid = Number(sessionId);
  if (!sid) return { ok: false, removed: 0, skipped_settled: 0 };

  const rows = db.prepare(
    "SELECT * FROM coach_earnings WHERE source_type = 'session' AND source_id = ?"
  ).all(sid);

  const del = db.prepare('DELETE FROM coach_earnings WHERE id = ?');
  const delRev = db.prepare('DELETE FROM session_revenue WHERE session_id = ?');
  const clearMark = db.prepare('UPDATE coach_sessions SET share_percent = NULL, coach_share_amount = NULL, earnings_id = NULL WHERE id = ?');

  let removed = 0;
  let skipped = 0;

  const run = db.transaction(() => {
    for (const r of rows) {
      if (r.settlement_id != null) {
        skipped += 1; // قبلاً تسویه شده — حذف نمی‌شود (audit trail مالی)
        continue;
      }
      del.run(r.id);
      removed += 1;
    }
    delRev.run(sid);
    clearMark.run(sid);
  });

  run();
  return { ok: true, removed, skipped_settled: skipped };
}

/**
 * حقوق ثابت ماهانه یک مربی (pay_model = 'fixed' یا 'hybrid').
 * idempotent: برای هر (coach, period) فقط یک سطر حقوق می‌سازد.
 */
function accrueMonthlySalary(db, { coachId, period, amount, note, actor }) {
  const cid = Number(coachId);
  const amt = clampMoney(amount);
  if (!cid || amt <= 0) return { ok: false, reason: 'INVALID_INPUT' };

  const existing = db.prepare(
    "SELECT id FROM coach_earnings WHERE coach_id = ? AND period = ? AND source_type = 'salary'"
  ).get(cid, String(period));
  if (existing) return { ok: true, earning_id: existing.id, created: false };

  const res = db.prepare(`
    INSERT INTO coach_earnings
      (coach_id, source_type, source_id, period, earned_at, unit_price,
       share_percent, share_basis, gross, net, note)
    VALUES (?, 'salary', NULL, ?, ?, 0, 0, 'salary', ?, ?, ?)
  `).run(cid, String(period), `${period}-01`, amt, amt, note || `حقوق ثابت ${period}${actor ? ` — ${actor}` : ''}`);

  return { ok: true, earning_id: Number(res.lastInsertRowid), created: true };
}

/** خلاصه سهم یک مربی در یک بازه (بدون تسویه) */
function summarizeCoach(db, coachId, from, to) {
  const cid = Number(coachId);
  const rows = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN source_type = 'session' THEN net ELSE 0 END), 0) AS session_total,
      COALESCE(SUM(CASE WHEN source_type = 'salary'  THEN net ELSE 0 END), 0) AS salary_total,
      COALESCE(SUM(CASE WHEN source_type = 'bonus'   THEN net ELSE 0 END), 0) AS bonus_total,
      COALESCE(SUM(net), 0) AS gross_total,
      COUNT(*) AS items
    FROM coach_earnings
    WHERE coach_id = ? AND earned_at BETWEEN ? AND ?
  `).get(cid, from, to);

  const adj = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN kind = 'deduction' THEN amount ELSE 0 END), 0) AS deductions,
      COALESCE(SUM(CASE WHEN kind = 'bonus'     THEN amount ELSE 0 END), 0) AS bonuses
    FROM coach_adjustments WHERE coach_id = ? AND period BETWEEN ? AND ?
  `).get(cid, String(from).slice(0, 7), String(to).slice(0, 7));

  const settled = db.prepare(`
    SELECT COALESCE(SUM(net), 0) AS total FROM coach_earnings
    WHERE coach_id = ? AND settlement_id IS NOT NULL AND earned_at BETWEEN ? AND ?
  `).get(cid, from, to);

  const gross = clampMoney(rows.gross_total);
  const deductions = clampMoney(adj.deductions);
  const net = clampMoney(gross + adj.bonuses - deductions);

  return {
    coach_id: cid,
    from, to,
    session_total: clampMoney(rows.session_total),
    salary_total: clampMoney(rows.salary_total),
    bonus_total: clampMoney(rows.bonus_total),
    adjustments_bonus: clampMoney(adj.bonuses),
    deductions,
    items: Number(rows.items) || 0,
    gross,
    net,
    settled: clampMoney(settled.total),
    remaining: clampMoney(net - settled.total),
  };
}

module.exports = {
  DEFAULT_SHARE_PERCENT,
  isoDate,
  isoDateTime,
  periodOf,
  clampMoney,
  resolveUnitPrice,
  resolveSharePercent,
  earnFromSession,
  revokeSessionEarnings,
  accrueMonthlySalary,
  summarizeCoach,
};