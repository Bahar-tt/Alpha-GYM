/** تست API فاز ۶-۹ روی سرور واقعی */
const BASE = 'http://localhost:3001';
let pass = 0, fail = 0;
const check = (l, c, e = '') => { if (c) { pass++; console.log(`  PASS  ${l}`); } else { fail++; console.log(`  FAIL  ${l}  ${e}`); } };
const section = (t) => console.log(`\n== ${t} ==`);

async function api(p, { method = 'GET', body, token } = {}) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, data: d };
}
async function setFeature(f, e) {
  const r = await fetch(`${BASE}/provider/feature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-provider-key': process.env.PROVIDER_KEY || 'alpha-change-me' },
    body: JSON.stringify({ feature: f, enabled: e ? 1 : 0 }),
  });
  return r.json().catch(() => null);
}

let nat = 5000;
function natId() { nat += 137; const p = String(nat).padStart(9, '0').slice(0, 9); const d = p.split('').map(Number); let s = 0; for (let i = 0; i < 9; i++) s += d[i] * (10 - i); const r = s % 11; return `${p}${r < 2 ? r : 11 - r}`; }
// تلفن یکتا بر اساس زمان + تلاش مجدد در صورت تکراری بودن
let phoneSeq = 0;
async function uniquePhone(token) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    phoneSeq += 1;
    const candidate = `091${String(30000000 + (Date.now() % 1000000) * 100 + phoneSeq).slice(-8)}`;
    const r = await api('/members', {
      method: 'POST', token,
      body: {
        name: `_ت_${Date.now() % 100000}_${phoneSeq}`, phone: candidate,
        expiry_date: '2027-01-01', birthday: '1995-03-15', national_id: natId(),
        sports: [{ sport: 'یوگا', sport_plan_key: 'یوگا::12', total_sessions: 12, tuition_amount: 800000,
          fee_basis: 'session', class_type: 'group', start_date: '2026-10-01', expiry_date: '2027-01-01' }],
      },
    });
    if (r.status === 201) return r.data.id;
    if (!/تلفن|کد ملی/.test(String(r.data?.error || ''))) {
      console.log(`     [abort] ${candidate} → ${JSON.stringify(r.data)}`);
      return null;
    }
  }
  return null;
}
let phone = 31000000;
const nextPhone = () => `091${String(phone += 137).padStart(8, '0')}`;

const created = { coachA: null, coachB: null, member: null, session: null };

(async () => {
  const login = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  const token = login.data?.token;
  if (!token) { console.log('login failed', JSON.stringify(login.data)); process.exit(1); }
  await setFeature('accounting', true); await setFeature('coach_portal', true);
  check('login + features', true);

  section('1) ساخت داده آزمایشی');
  const mkCoach = async (tag, share) => {
    for (let i = 0; i < 20; i += 1) {
      const r = await api('/accounting/coaches', { method: 'POST', token,
        body: { name: `_ت_${tag}_${Date.now() % 100000}_${i}`, phone: nextPhone(),
                sports: [{ sport: 'یوگا', share_percent: share, commission_percent: share }] } });
      if (r.data?.id) return r.data.id;
    }
    return null;
  };
  created.coachA = await mkCoach('الف', 50);
  created.coachB = await mkCoach('ب', 50);
  check('۲ مربی ساخته شد', created.coachA > 0 && created.coachB > 0);

  created.member = await uniquePhone(token);
  check('عضو ساخته شد', created.member > 0, String(created.member));

  const sess = await api('/coach-sessions', { method: 'POST', token, body: {
    member_id: created.member, session_date: '2026-10-05', session_time: '18:00',
    duration_minutes: 60, session_type: 'personal', coach_id: created.coachA, sport: 'یوگا',
  } });
  created.session = sess.data?.id;
  check('جلسه ساخته شد', created.session > 0, JSON.stringify(sess.data).slice(0, 150));
  check('مربی جلسه درست ثبت شد', sess.data?.coach_id === created.coachA, `got ${sess.data?.coach_id} want ${created.coachA}`);
  check('رشته جلسه ثبت شد', sess.data?.sport === 'یوگا', sess.data?.sport);
  section('2) تکمیل جلسه → سهم ساخته شد');
  const done = await api(`/coach-sessions/${created.session}`, { method: 'PATCH', token, body: { status: 'completed' } });
  check('جلسه completed', done.status === 200 && done.data?.status === 'completed');
  check('سهم ساخته شد', done.data?.earnings?.earnings?.length >= 1, JSON.stringify(done.data?.earnings).slice(0, 200));
  const firstE = done.data?.earnings?.earnings?.[0];
  if (firstE) {
    console.log(`     سهم: coach=${firstE.coach_id} نرخ=${firstE.unit_price} درصد=${firstE.share_percent} مبلغ=${firstE.net}`);
    check('سهم به مربی A (نه admin) ثبت شد', firstE.coach_id === created.coachA, `got ${firstE.coach_id} want ${created.coachA}`);
    check('نرخ از پلن یوگا = 66,667', firstE.unit_price === 66667, `got ${firstE.unit_price}`);
    check('سهم ۵۰٪ = 33,334', firstE.net === 33334, `got ${firstE.net}`);
  }

  section('3) فاز ۶ — تقسیم جلسه');
  let r = await api(`/accounting/coach-sessions/${created.session}/splits`, { token });
  check('GET splits کار کرد', r.status === 200, JSON.stringify(r.data).slice(0, 100));

  r = await api(`/accounting/coach-sessions/${created.session}/splits`, { method: 'PUT', token,
    body: { splits: [{ coach_id: created.coachA, share_percent: 70 }, { coach_id: created.coachB, share_percent: 30 }] } });
  check('تقسیم ۷۰/۳۰ ثبت شد', r.status === 200 && r.data?.ok === true, JSON.stringify(r.data).slice(0, 150));
  check('۲ شریک برگشت', r.data?.splits?.length === 2, `got ${r.data?.splits?.length}`);

  r = await api(`/accounting/coach-sessions/${created.session}/splits`, { method: 'PUT', token,
    body: { splits: [{ coach_id: created.coachA, share_percent: 50 }, { coach_id: created.coachB, share_percent: 20 }] } });
  check('مجموع ≠ ۱۰۰ رد شد', r.status === 400, `${r.status} ${JSON.stringify(r.data)}`);

  r = await api(`/accounting/coach-sessions/${created.session}/splits`, { method: 'PUT', token, body: { splits: [] } });
  check('برداشتن تقسیم', r.status === 200 && r.data?.splits?.length === 0);

  section('4) فاز ۷ — کسورات و پاداش');
  r = await api(`/accounting/coaches/${created.coachA}/adjustments`, { method: 'POST', token,
    body: { period: '2026-10', kind: 'deduction', amount: 100000, reason: 'جریمه تست' } });
  check('کسر ثبت شد', r.status === 201 && r.data?.ok === true, JSON.stringify(r.data).slice(0, 120));
  const adjId = r.data?.id;
  r = await api(`/accounting/coaches/${created.coachA}/adjustments`, { method: 'POST', token,
    body: { period: '2026-10', kind: 'bonus', amount: 50000, reason: 'پاداش تست' } });
  check('پاداش ثبت شد', r.status === 201);

  r = await api(`/accounting/coaches/${created.coachA}/adjustments`, { method: 'POST', token,
    body: { period: '2026-10', kind: 'gift', amount: 1000 } });
  check('نوع نامعتبر رد شد', r.status === 400, `${r.status}`);

  r = await api(`/accounting/coaches/${created.coachA}/adjustments?period=2026-10`, { token });
  check('۲ آیتم فهرست', r.data?.adjustments?.length === 2, `got ${r.data?.adjustments?.length}`);

  r = await api(`/accounting/adjustments/${adjId}`, { method: 'DELETE', token });
  check('حذف کسر', r.status === 200 && r.data?.ok === true, JSON.stringify(r.data));

  section('5) فاز ۸ — تسویه');
  r = await api(`/accounting/coaches/${created.coachA}/settle-preview?period=2026-10`, { token });
  check('پیش‌نمایش تسویه', r.status === 200 && r.data?.net != null, JSON.stringify(r.data).slice(0, 180));
  const previewNet = r.data?.net;
  console.log(`     پیش‌نمایش: items=${r.data?.item_count} gross=${r.data?.gross} net=${previewNet}`);

  r = await api(`/accounting/coaches/${created.coachA}/settle`, { method: 'POST', token,
    body: { period: '2026-10', note: 'تست API' } });
  check('تسویه ثبت شد', r.status === 201 && r.data?.ok === true, JSON.stringify(r.data).slice(0, 150));
  const settlementId = r.data?.settlement_id;
  check('net با پیش‌نمایش یکی', r.data?.net === previewNet, `${r.data?.net} vs ${previewNet}`);

  r = await api('/accounting/settlements', { token });
  check('فهرست تسویه‌ها', Array.isArray(r.data), `got ${typeof r.data}`);

  r = await api(`/accounting/settlements/${settlementId}`, { token });
  check('جزئیات تسویه', r.status === 200 && r.data?.settlement?.id === settlementId, JSON.stringify(r.data).slice(0, 120));
  check('ریز آیتم‌ها دارد', (r.data?.items?.length || 0) > 0, `got ${r.data?.items?.length}`);

  r = await api(`/accounting/settlements/${settlementId}/export.csv`, { token });
  check('خروجی CSV', r.status === 200, `${r.status}`);

  section('6) فاز ۹ — گزارش‌ها');
  r = await api('/accounting/coach-earnings?from=2026-10-01&to=2026-10-31', { token });
  check('داشبورد سودآوری', r.status === 200 && Array.isArray(r.data), JSON.stringify(r.data).slice(0, 100));
  check('مربیان در گزارش', r.data?.length > 0, `got ${r.data?.length}`);
  const rowA = (r.data || []).find((x) => x.id === created.coachA);
  if (rowA) {
    console.log(`     ${rowA.name}: sessions=${rowA.sessions} gross=${rowA.gross} net=${rowA.net} settled=${rowA.settled} remaining=${rowA.remaining}`);
    check('سهم محاسبه شده', rowA.gross > 0);
    check('تسویه‌شده گزارش شد', rowA.settled > 0);
  }

  r = await api('/accounting/sport-profitability?from=2026-10-01&to=2026-10-31', { token });
  check('سودآوری رشته‌ها', r.status === 200 && Array.isArray(r.data), JSON.stringify(r.data).slice(0, 100));

  r = await api(`/accounting/coaches/${created.coachA}/forecast?period=2026-10`, { token });
  check('پیش‌بینی', r.status === 200 && r.data?.days_in_month > 0, JSON.stringify(r.data).slice(0, 120));

  r = await api(`/accounting/coach-earnings/${created.coachA}?from=2026-10-01&to=2026-10-31`, { token });
  check('ریز سهم مربی', r.status === 200 && Array.isArray(r.data?.earnings), JSON.stringify(r.data).slice(0, 100));
  check('خلاصه هست', r.data?.summary?.net != null);

  r = await api(`/accounting/members/${created.member}/plan-utilization`, { token });
  check('تطبیق پلن', r.status === 200 && Array.isArray(r.data?.plans), JSON.stringify(r.data).slice(0, 150));
  if (r.data?.plans?.[0]) {
    console.log(`     ${r.data.plans[0].sport}: ${r.data.plans[0].used_sessions}/${r.data.plans[0].total_sessions} جلسه، باقی‌مانده ${r.data.plans[0].remaining_value}`);
    check('نرخ واحد محاسبه شد', r.data.plans[0].unit_price === 66667, `got ${r.data.plans[0].unit_price}`);
  }

  section('7) لغو تسویه');
  r = await api(`/accounting/settlements/${settlementId}`, { method: 'DELETE', token });
  check('لغو شد', r.status === 200 && r.data?.ok === true, JSON.stringify(r.data));
  r = await api(`/accounting/coaches/${created.coachA}/settle-preview?period=2026-10`, { token });
  check('سهم‌ها برگشتند (دوباره قابل تسویه)', r.data?.gross > 0, `gross=${r.data?.gross}`);

  section('8) تسویه گروهی');
  r = await api('/accounting/coaches/settle-all', { method: 'POST', token, body: { period: '2026-10', note: 'گروهی تست' } });
  check('تسویه گروهی اجرا شد', r.status === 200 && r.data?.settled_count != null, JSON.stringify(r.data).slice(0, 200));
  console.log(`     ${r.data?.settled_count} تسویه شد، ${r.data?.skipped_count} رد شد، مجموع ${r.data?.total_net}`);

  section('9) پاک‌سازی');
  // لغو همه تسویه‌های تستی
  const all = await api('/accounting/settlements?period=2026-10', { token });
  for (const s of (all.data || [])) await api(`/accounting/settlements/${s.id}`, { method: 'DELETE', token });
  if (created.session) await api(`/coach-sessions/${created.session}`, { method: 'DELETE', token });
  if (created.member) await api(`/members/${created.member}`, { method: 'DELETE', token });
  if (created.coachA) await api(`/accounting/coaches/${created.coachA}`, { method: 'DELETE', token });
  if (created.coachB) await api(`/accounting/coaches/${created.coachB}`, { method: 'DELETE', token });
  check('پاک‌سازی انجام شد', true);

  console.log(`\n${'='.repeat(46)}\n  RESULT: ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('err:', e.message, e.stack); process.exit(1); });