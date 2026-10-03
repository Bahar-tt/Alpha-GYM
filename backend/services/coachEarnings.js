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

// یکسان‌سازی نام رشته: «کراسفیت» و «کراس‌فیت» و «کراس فیت» باید یکی باشند.
// چون نام رشته‌ها از اکسل مربیان و کاتالوگ پلن‌ها از دو منبع می‌آید.
function normalizeSportName(name) {
  if (name == null) return '';
  return String(name)
    .replace(/[‌‏‎]/g, '')
    .replace(/[\s_\-]+/g, '')          // همه فاصله‌ها حذف
    .replace(/[يى]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .toLowerCase();
}

/** نام استاندارد رشته را از کاتالوگ پلن‌ها پیدا می‌کند (در صورت وجود). */
function canonicalSport(db, name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const rows = db.prepare('SELECT DISTINCT sport FROM sport_plans').all();
  const target = normalizeSportName(raw);
  for (const r of rows) {
    if (normalizeSportName(r.sport) === target) return r.sport;
  }
  return raw;
}

/** مربیانِ یک رشته (برای نمایش در فرم ثبت‌نام). */
function coachesForSport(db, sport, { includeInactive = false } = {}) {
  if (!sport) return [];
  const target = normalizeSportName(sport);
  const rows = db.prepare(`
    SELECT c.id, c.name, c.phone, c.national_id, c.pay_model, c.default_share,
           c.monthly_salary, c.can_private, c.can_program, c.is_active,
           cs.share_percent, cs.sport AS coach_sport, cs.gym_percent, cs.hourly_rate
    FROM coaches c
    LEFT JOIN coach_sports cs ON cs.coach_id = c.id
    ${includeInactive ? '' : 'WHERE c.is_active = 1'}
    ORDER BY c.name
  `).all();

  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (normalizeSportName(r.coach_sport) !== target) continue;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      name: r.name,
      phone: r.phone,
      national_id: r.national_id,
      pay_model: r.pay_model,
      default_share: r.default_share,
      monthly_salary: r.monthly_salary,
      can_private: !!r.can_private,
      can_program: !!r.can_program,
      is_active: !!r.is_active,
      share_percent: r.share_percent ?? r.default_share,
      gym_percent: r.gym_percent,
      hourly_rate: r.hourly_rate,
      sport: r.coach_sport,
    });
  }
  return out;
}

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

  const markSession = db.prepare('UPDATE coach_sessions SET share_percent = ?, coach_share_amount = ?, unit_price = ?, earnings_id = ? WHERE id = ?');

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
        ? `جلسه ${sid} — ${sport || ''} — ${duration} دقیقه — ${baseSharePercent}٪ × ${splitPct}٪ تقسیم = ${effectiveShare}٪`
        : `جلسه ${sid} — ${sport || ''} — ${duration} دقیقه — ${baseSharePercent}٪`;

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
        // سهم پایهٔ مربی (۵۰) در share_percent ذخیره می‌شود؛ درصد مشارکت در یادداشت
        baseSharePercent,
        gross,
        gross,
        note
      );

      if (res.changes > 0) {
        const earning = db.prepare('SELECT * FROM coach_earnings WHERE id = ?').get(res.lastInsertRowid);
        out.earnings.push(earning);
        if (!session.earnings_id && coachId === Number(session.coach_id)) {
          // unit_price روی جلسه اسنپ می‌شود تا بازمحاسبه قطعی باشد
          markSession.run(baseSharePercent, gross, unitPrice, res.lastInsertRowid, sid);
        }
      } else {
        // سطر از قبل موجود بود (idempotent) — همان را برمی‌گردانیم
        const existing = db.prepare(
          "SELECT * FROM coach_earnings WHERE source_type = 'session' AND source_id = ? AND coach_id = ?"
        ).get(sid, coachId);
        if (existing) out.earnings.push(existing);
      }
    }

    // سهم باشگاه فقط برای مربیِ اصلی جلسه یک‌بار ثبت می‌شود.
    // چون session_id یکتاست، رکورد موجود به‌روزرسانی می‌شود تا بازمحاسبه
    // مقدار کهنه را نگه ندارد.
    if (gymPercent > 0 && Number(session.coach_id)) {
      const gymAmount = clampMoney((unitPrice * gymPercent) / 100);
      const coachShare = clampMoney((unitPrice * baseSharePercent) / 100);
      const updRevenue = db.prepare(`
        UPDATE session_revenue SET
          unit_price = ?, gross_revenue = ?, coach_share = ?, gym_share = ?,
          share_percent = ?, period = ?, occurred_at = ?
        WHERE session_id = ?
      `);
      const rev = insRevenue.run(
        sid,
        session.member_id ? Number(session.member_id) : null,
        member ? member.name : null,
        sport,
        Number(session.coach_id),
        unitPrice,
        unitPrice,
        coachShare,
        gymAmount,
        baseSharePercent,
        period,
        earnedAt
      );
      if (rev.changes === 0) {
        updRevenue.run(unitPrice, unitPrice, coachShare, gymAmount, baseSharePercent, period, earnedAt, sid);
      }
    }
  });

  run();
  return out;
}

/**
 * تنظیم تقسیم یک جلسه بین چند مربی.
 *
 * مثال: برنامه ترکیبی بدنسازی + TRX
 *   splits = [{ coach_id: 3, share_percent: 60 }, { coach_id: 7, share_percent: 40 }]
 *   سهم رضا = ۵۰٪ × ۶۰٪ ، سهم امیر = ۵۰٪ × ۴۰٪
 *
 * اعتبارسنجی: مجموع درصدها باید دقیقاً ۱۰۰ باشد و هر مربی فعال باشد.
 * اگر جلسه قبلاً completed و تسویه‌نشده بود، سهم‌ها دوباره ساخته می‌شوند.
 *
 * @returns {{ok: boolean, splits?: Array, error?: string}}
 */
function setSessionSplits(db, sessionId, splits) {
  const sid = Number(sessionId);
  const session = db.prepare('SELECT * FROM coach_sessions WHERE id = ?').get(sid);
  if (!session) return { ok: false, error: 'جلسه پیدا نشد' };

  const clean = (Array.isArray(splits) ? splits : [])
    .map((s) => ({
      coach_id: Number(s && s.coach_id) || 0,
      share_percent: Math.round(Number(s && s.share_percent) || 0),
    }))
    .filter((s) => s.coach_id > 0 && s.share_percent > 0);

  // مربی‌های تکراری ادغام می‌شوند
  const merged = new Map();
  for (const s of clean) {
    merged.set(s.coach_id, (merged.get(s.coach_id) || 0) + s.share_percent);
  }
  const final = Array.from(merged, ([coach_id, share_percent]) => ({ coach_id, share_percent }));

  if (final.length === 0) {
    // تقسیم را برداشتن = مربیِ اصلی جلسه، ۱۰۰٪
    const del = db.prepare('DELETE FROM coach_session_splits WHERE session_id = ?');
    const clearMark = db.prepare('UPDATE coach_sessions SET split_done = 0 WHERE id = ?');
    const run = db.transaction(() => { del.run(sid); clearMark.run(sid); });
    run();
    // سهم‌ها باید با وضعیت جدید بازسازی شوند (وگرنه سهم تقسیم‌شده باقی می‌ماند)
    let earnings = null;
    if (session.status === 'completed') {
      revokeSessionEarnings(db, sid);
      earnings = earnFromSession(db, sid);
    }
    return { ok: true, splits: [], earnings };
  }

  if (final.length < 2) return { ok: false, error: 'برای تقسیم، حداقل دو مربی لازم است' };

  const total = final.reduce((s, x) => s + x.share_percent, 0);
  if (total !== 100) {
    return { ok: false, error: `مجموع درصدها باید ۱۰۰ باشد (فعلی: ${total})` };
  }

  // همه مربیان باید فعال باشند
  const ids = final.map((s) => s.coach_id);
  const active = db.prepare(
    `SELECT id, name FROM coaches WHERE id IN (${ids.map(() => '?').join(',')}) AND is_active = 1`
  ).all(...ids);
  if (active.length !== ids.length) {
    const found = new Set(active.map((a) => a.id));
    const missing = ids.filter((i) => !found.has(i));
    return { ok: false, error: `مربی غیرفعال یا ناموجود: ${missing.join('، ')}` };
  }

  const del = db.prepare('DELETE FROM coach_session_splits WHERE session_id = ?');
  const ins = db.prepare(
    'INSERT INTO coach_session_splits (session_id, coach_id, share_percent) VALUES (?, ?, ?)'
  );
  const mark = db.prepare('UPDATE coach_sessions SET split_done = 1 WHERE id = ?');

  const run = db.transaction(() => {
    del.run(sid);
    for (const s of final) ins.run(sid, s.coach_id, s.share_percent);
    mark.run(sid);
  });
  run();

  // اگر جلسه completed بود، سهم‌ها را با تقسیم جدید بازسازی کن
  let earnings = null;
  if (session.status === 'completed') {
    revokeSessionEarnings(db, sid);
    earnings = earnFromSession(db, sid);
  }

  const rows = db.prepare(
    'SELECT sp.coach_id, sp.share_percent, c.name FROM coach_session_splits sp JOIN coaches c ON c.id = sp.coach_id WHERE sp.session_id = ? ORDER BY sp.id'
  ).all(sid);

  return { ok: true, splits: rows, earnings };
}

/** خواندن تقسیم یک جلسه (برای UI) */
function getSessionSplits(db, sessionId) {
  return db.prepare(`
    SELECT sp.id, sp.coach_id, sp.share_percent, c.name, c.phone,
           cs.share_percent AS coach_share_percent
    FROM coach_session_splits sp
    JOIN coaches c ON c.id = sp.coach_id
    LEFT JOIN coach_sports cs ON cs.coach_id = c.id AND cs.sport = ?
    WHERE sp.session_id = ?
    ORDER BY sp.id
  `).all(String(db.prepare('SELECT sport FROM coach_sessions WHERE id = ?').get(Number(sessionId))?.sport || ''), Number(sessionId));
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

  // هم با source_id و هم با session_id می‌گردیم: رکوردهای قدیمی ممکن است
  // فقط با یکی از این دو ستون قابل ردیابی باشند.
  const rows = db.prepare(
    "SELECT * FROM coach_earnings WHERE source_type = 'session' AND (source_id = ? OR session_id = ?)"
  ).all(sid, sid);

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

/* =========================
   کسورات و پاداش (فاز ۷)
========================= */

const ADJ_KINDS = ['deduction', 'bonus'];

function addAdjustment(db, { coachId, period, kind, amount, reason, actor }) {
  const cid = Number(coachId);
  const k = String(kind || '').trim();
  const amt = clampMoney(amount);
  if (!cid) return { ok: false, error: 'مربی نامعتبر است' };
  if (!ADJ_KINDS.includes(k)) return { ok: false, error: 'نوع نامعتبر است (deduction یا bonus)' };
  if (amt <= 0) return { ok: false, error: 'مبلغ باید بزرگ‌تر از صفر باشد' };

  // دوره به ماه محدود می‌شود و باید در گذشته نباشد مگر برای اصلاح
  const per = String(period || periodOf(new Date())).slice(0, 7);
  const res = db.prepare(`
    INSERT INTO coach_adjustments (coach_id, period, kind, amount, reason, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(cid, per, k, amt, reason ? String(reason).trim() : null, actor || null);

  return { ok: true, id: Number(res.lastInsertRowid), adjustment: db.prepare('SELECT * FROM coach_adjustments WHERE id = ?').get(res.lastInsertRowid) };
}

function deleteAdjustment(db, id) {
  const row = db.prepare('SELECT * FROM coach_adjustments WHERE id = ?').get(Number(id));
  if (!row) return { ok: false, error: 'کسر/پاداش پیدا نشد' };
  db.prepare('DELETE FROM coach_adjustments WHERE id = ?').run(Number(id));
  return { ok: true, deleted: row };
}

function listAdjustments(db, coachId, period) {
  const cid = Number(coachId);
  if (period) {
    return db.prepare('SELECT * FROM coach_adjustments WHERE coach_id = ? AND period = ? ORDER BY created_at DESC, id DESC')
      .all(cid, String(period).slice(0, 7));
  }
  return db.prepare('SELECT * FROM coach_adjustments WHERE coach_id = ? ORDER BY period DESC, created_at DESC, id DESC').all(cid);
}

/* =========================
   تسویه (فاز ۸)
========================= */

/**
 * تسویه سهم‌های یک مربی در یک دوره.
 *
 * برخلاف نسخه قدیمی که فقط یک عدد در ماه نگه می‌داشت، اینجا هر سطر درآمد
 * دقیقاً به یک settlement گره می‌خورد (settlement_items). نتیجه:
 *  • تسویه جزئی دقیقاً کار می‌کند
 *  • می‌دانیم هر ریال بابت چه جلساتی بوده
 *  • کسورات دوره هم در تسویه لحاظ می‌شود
 *
 * @param {object} db
 * @param {object} opts
 *   coachId, period ('YYYY-MM'), from, to (تاریخ‌های جلسه),
 *   includeAdjustments (bool, پیش‌فرض true), note, actor
 */
function settleCoach(db, { coachId, period, from, to, includeAdjustments = true, note, actor }) {
  const cid = Number(coachId);
  if (!cid) return { ok: false, error: 'مربی نامعتبر است' };

  const per = String(period || periodOf(new Date())).slice(0, 7);
  const fromDate = from || `${per}-01`;
  const toDate = to || `${per}-31`;

  const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(cid);
  if (!coach) return { ok: false, error: 'مربی پیدا نشد' };

  // سهم‌های تسویه‌نشده در این بازه
  const pending = db.prepare(`
    SELECT * FROM coach_earnings
    WHERE coach_id = ? AND settlement_id IS NULL AND earned_at BETWEEN ? AND ?
    ORDER BY earned_at, id
  `).all(cid, fromDate, toDate);

  const gross = clampMoney(pending.reduce((s, r) => s + (Number(r.net) || 0), 0));

  // کسورات و پاداش‌های دوره — فقط مواردی که قبلاً در تسویه‌ای لحاظ نشده‌اند.
  // بدون این شرط، تسویهٔ دوم همان کسورات را دوباره کم می‌کرد.
  let deductions = 0;
  let bonuses = 0;
  if (includeAdjustments) {
    const settledPeriods = db.prepare(
      'SELECT period FROM coach_settlements WHERE coach_id = ?'
    ).all(cid).map((r) => r.period);
    const alreadySettled = settledPeriods.includes(per);

    const adj = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN kind='deduction' THEN amount ELSE 0 END),0) AS d,
             COALESCE(SUM(CASE WHEN kind='bonus'     THEN amount ELSE 0 END),0) AS b
      FROM coach_adjustments WHERE coach_id = ? AND period = ?
    `).get(cid, per);
    deductions = alreadySettled ? 0 : clampMoney(adj.d);
    bonuses = alreadySettled ? 0 : clampMoney(adj.b);
  }

  const net = clampMoney(gross + bonuses - deductions);

  // حقوق ثابت: اگر مربی حقوق‌ثابت دارد و برای این دوره سطر حقوق ندارد، بساز.
  // این کار باید «قبل» از بررسی خالی‌بودن انجام شود، وگرنه مربی حقوق‌ثابت
  // که هیچ جلسه‌ای ندارد هرگز قابل تسویه نخواهد بود.
  const salaryCents = clampMoney(coach.monthly_salary);
  if ((coach.pay_model === 'fixed' || coach.pay_model === 'hybrid') && salaryCents > 0) {
    const has = db.prepare(
      "SELECT id FROM coach_earnings WHERE coach_id = ? AND period = ? AND source_type = 'salary'"
    ).get(cid, per);
    if (!has) {
      accrueMonthlySalary(db, { coachId: cid, period: per, amount: salaryCents, actor });
      const extra = db.prepare(`
        SELECT * FROM coach_earnings
        WHERE coach_id = ? AND settlement_id IS NULL AND source_type = 'salary' AND period = ?
      `).all(cid, per);
      for (const e of extra) pending.push(e);
    }
  }

  if (pending.length === 0 && net === 0) {
    return { ok: false, error: 'چیزی برای تسویه وجود ندارد' };
  }

  const finalGross = clampMoney(pending.reduce((s, r) => s + (Number(r.net) || 0), 0));
  const finalNet = clampMoney(finalGross + bonuses - deductions);

  const insSettlement = db.prepare(`
    INSERT INTO coach_settlements (coach_id, period, period_start, period_end, amount, gross, deductions, net, item_count, note, settled_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insItem = db.prepare('INSERT INTO settlement_items (settlement_id, earning_id, amount) VALUES (?, ?, ?)');
  const markEarning = db.prepare('UPDATE coach_earnings SET settlement_id = ? WHERE id = ?');

  let settlementId = 0;
  const run = db.transaction(() => {
    const res = insSettlement.run(
      cid, per, fromDate, toDate,
      finalNet, finalGross, deductions, finalNet,
      pending.length, note ? String(note).trim() : null, actor || null
    );
    settlementId = Number(res.lastInsertRowid);
    for (const e of pending) {
      insItem.run(settlementId, e.id, Number(e.net) || 0);
      markEarning.run(settlementId, e.id);
    }
  });
  run();

  return {
    ok: true,
    settlement_id: settlementId,
    items: pending.length,
    gross: finalGross,
    deductions,
    bonuses,
    net: finalNet,
    settlement: db.prepare('SELECT * FROM coach_settlements WHERE id = ?').get(settlementId),
  };
}

/** ریز یک تسویه (کدام جلسات پرداخت شد) */
function settlementDetail(db, settlementId) {
  const s = db.prepare('SELECT * FROM coach_settlements WHERE id = ?').get(Number(settlementId));
  if (!s) return null;
  const coach = db.prepare('SELECT id, name, phone FROM coaches WHERE id = ?').get(s.coach_id);
  const items = db.prepare(`
    SELECT si.amount, e.*
    FROM settlement_items si
    JOIN coach_earnings e ON e.id = si.earning_id
    WHERE si.settlement_id = ?
    ORDER BY e.earned_at, e.id
  `).all(Number(settlementId));
  const adjustments = db.prepare(
    'SELECT * FROM coach_adjustments WHERE coach_id = ? AND period = ? ORDER BY id'
  ).all(s.coach_id, s.period);
  return { settlement: s, coach, items, adjustments };
}

/** حذف تسویه (برگرداندن سهم‌ها به وضعیت تسویه‌نشده) */
function cancelSettlement(db, settlementId, actor) {
  const s = db.prepare('SELECT * FROM coach_settlements WHERE id = ?').get(Number(settlementId));
  if (!s) return { ok: false, error: 'تسویه پیدا نشد' };
  const unmark = db.prepare('UPDATE coach_earnings SET settlement_id = NULL WHERE settlement_id = ?');
  const delItems = db.prepare('DELETE FROM settlement_items WHERE settlement_id = ?');
  const delSettlement = db.prepare('DELETE FROM coach_settlements WHERE id = ?');
  const run = db.transaction(() => {
    unmark.run(Number(settlementId));
    delItems.run(Number(settlementId));
    delSettlement.run(Number(settlementId));
  });
  run();
  return { ok: true, cancelled: s };
}

/* =========================
   گزارش‌ها (فاز ۹)
========================= */

/** داشبورد سودآوری مربیان — هر مربی چقدر آورد و چقدر برد */
function coachProfitability(db, from, to) {
  const coaches = db.prepare('SELECT * FROM coaches WHERE is_active = 1 ORDER BY name').all();
  const revenue = db.prepare(`
    SELECT coach_id, COALESCE(SUM(gross_revenue),0) AS revenue,
           COALESCE(SUM(coach_share),0) AS coach_share,
           COALESCE(SUM(gym_share),0) AS gym_share,
           COUNT(*) AS sessions
    FROM session_revenue WHERE occurred_at BETWEEN ? AND ?
    GROUP BY coach_id
  `).all(from, to);

  const revByCoach = new Map(revenue.map((r) => [r.coach_id, r]));

  return coaches.map((c) => {
    const sum = summarizeCoach(db, c.id, from, to);
    const rev = revByCoach.get(c.id) || {};
    const revenueTotal = clampMoney(rev.revenue);
    const gymTotal = clampMoney(rev.gym_share);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      pay_model: c.pay_model,
      monthly_salary: c.monthly_salary,
      can_private: !!c.can_private,
      can_program: !!c.can_program,
      sports: db.prepare('SELECT sport FROM coach_sports WHERE coach_id = ?').all(c.id).map((r) => r.sport),
      // سهم مربی (بدهی باشگاه)
      session_total: sum.session_total,
      salary_total: sum.salary_total,
      gross: sum.gross,
      deductions: sum.deductions,
      bonuses: sum.adjustments_bonus,
      net: sum.net,
      settled: sum.settled,
      remaining: sum.remaining,
      // درآمد و سهم باشگاه (اگر gym_percent تعریف شده باشد)
      sessions: Number(rev.sessions) || 0,
      revenue: revenueTotal,
      gym_share: gymTotal,
      gym_margin: clampMoney(revenueTotal - gymTotal - sum.gross),
    };
  });
}

/** گزارش سودآوری هر رشته */
function sportProfitability(db, from, to) {
  const revenue = db.prepare(`
    SELECT sport,
           COALESCE(SUM(gross_revenue),0) AS revenue,
           COALESCE(SUM(coach_share),0) AS coach_share,
           COALESCE(SUM(gym_share),0) AS gym_share,
           COUNT(*) AS sessions
    FROM session_revenue WHERE occurred_at BETWEEN ? AND ?
    GROUP BY sport
  `).all(from, to);
  const earnings = db.prepare(`
    SELECT sport, COALESCE(SUM(net),0) AS coach_paid, COUNT(*) AS items
    FROM coach_earnings WHERE earned_at BETWEEN ? AND ? AND source_type = 'session'
    GROUP BY sport
  `).all(from, to);
  const earnBySport = new Map(earnings.map((e) => [e.sport, e]));

  return revenue.map((r) => {
    const e = earnBySport.get(r.sport) || {};
    const revenueTotal = clampMoney(r.revenue);
    const coachPaid = clampMoney(e.coach_paid);
    const gymRevenue = clampMoney(r.gym_share);
    return {
      sport: r.sport,
      sessions: Number(r.sessions) || 0,
      revenue: revenueTotal,
      coach_share: clampMoney(r.coach_share),
      gym_share: gymRevenue,
      coach_paid: coachPaid,
      // سود واقعی باشگاه = سهم باشگاه از جلسات − سهم پرداختی مربیان
      net_profit: clampMoney(gymRevenue - coachPaid),
    };
  }).sort((a, b) => b.net_profit - a.net_profit);
}

/** پیش‌بینی پایان ماه بر اساس جلسات ثبت‌شده تا امروز */
function forecastMonth(db, coachId, period) {
  const cid = Number(coachId);
  const per = String(period || periodOf(new Date())).slice(0, 7);
  const toDate = isoDate();
  const sum = summarizeCoach(db, cid, `${per}-01`, `${per}-31`);
  const sessionSum = sum.session_total;

  // میانگین روزانه = جلسات ثبت‌شده تا امروز / روزهای گذشته
  const dayOfMonth = Number(toDate.slice(8, 10));
  const daysInMonth = new Date(Number(per.slice(0, 4)), Number(per.slice(5, 7)), 0).getDate();
  const perDay = dayOfMonth > 0 ? sessionSum / dayOfMonth : sessionSum;
  const projected = clampMoney(perDay * daysInMonth);

  return {
    coach_id: cid,
    period: per,
    days_passed: dayOfMonth,
    days_in_month: daysInMonth,
    session_total: sessionSum,
    per_day: clampMoney(perDay),
    projected_sessions: projected,
    // اگر جلسه‌ها ثابت باشند، تخمین کل درآمد ماه
    projected_total: clampMoney(sum.net - sessionSum + projected),
  };
}

/** تطبیق استفاده از پلن — چند جلسه رفته، چقدر باقی مانده */
function planUtilization(db, memberId) {
  const mid = Number(memberId);
  const rows = db.prepare(`
    SELECT ms.*, c.name AS coach_name_resolved
    FROM member_sports ms
    LEFT JOIN coaches c ON c.id = ms.coach_id
    WHERE ms.member_id = ?
  `).all(mid);

  return rows.map((r) => {
    const total = Number(r.total_sessions) || 0;
    const used = Number(r.used_sessions) || 0;
    const remainingSessions = Math.max(0, total - used);
    const unit = Number(r.unit_price) || 0;
    const tuition = Number(r.tuition_amount) || 0;
    return {
      sport_id: r.id,
      sport: r.sport,
      coach_id: r.coach_id,
      coach_name: r.coach_name || r.coach_name_resolved,
      class_type: r.class_type,
      total_sessions: total,
      used_sessions: used,
      remaining_sessions: remainingSessions,
      tuition_amount: tuition,
      unit_price: unit,
      used_value: clampMoney(used * unit),
      remaining_value: clampMoney(remainingSessions * unit),
      // جلسات انجام‌شده از طریق موتور سهم (تطبیق با used_sessions)
      earned_sessions: db.prepare(
        "SELECT COUNT(*) AS c FROM coach_earnings WHERE member_id = ? AND sport = ? AND source_type='session'"
      ).get(mid, r.sport).c,
      is_expired: r.expiry_date ? r.expiry_date < isoDate() : false,
    };
  });
}

module.exports = {
  DEFAULT_SHARE_PERCENT,
  normalizeSportName,
  canonicalSport,
  coachesForSport,
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
  setSessionSplits,
  getSessionSplits,
  addAdjustment,
  deleteAdjustment,
  listAdjustments,
  settleCoach,
  settlementDetail,
  cancelSettlement,
  coachProfitability,
  sportProfitability,
  forecastMonth,
  planUtilization,
};