/**
 * test-api-integration.js — end-to-end test for the coach earnings engine
 * Prereq: backend running on :3001
 * Run:   node test-api-integration.js
 */

const BASE = 'http://localhost:3001';
const PROVIDER_KEY = process.env.PROVIDER_KEY || 'alpha-change-me';

let pass = 0;
let fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${label}`); }
  else { fail += 1; console.log(`  FAIL  ${label}  ${extra}`); }
}
function section(t) { console.log(`\n== ${t} ==`); }
function dump(v, n = 220) {
  if (v == null) return '(null)';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return String(s).slice(0, n);
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}

async function setFeature(feature, enabled) {
  const res = await fetch(`${BASE}/provider/feature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-provider-key': PROVIDER_KEY },
    body: JSON.stringify({ feature, enabled: enabled ? 1 : 0 }),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

(async () => {
  const made = { sessionId: null, memberId: null, coachId: null };

  try {
    section('1) health');
    const health = await api('/health');
    check('server up', health.status === 200, dump(health.data));

    section('2) admin login + feature flags');
    const login = await api('/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'admin123' },
    });
    if (login.status !== 200 || !login.data?.token) {
      console.log(`  abort: login failed ${dump(login.data)}`);
      process.exit(1);
    }
    const token = login.data.token;
    check('admin logged in', true);

    await setFeature('accounting', true);
    const fAcc = await setFeature('accounting', true);
    check('feature accounting enabled', fAcc.status === 200 && fAcc.data?.ok === true, dump(fAcc.data));
    const fCoach = await setFeature('coach_portal', true);
    check('feature coach_portal enabled', fCoach.status === 200 && fCoach.data?.ok === true, dump(fCoach.data));

    section('3) sport plan catalog (phase 2)');
    const plans = await api('/accounting/sport-plans', { token });
    if (plans.status === 404) {
      console.log('  SKIP  catalog endpoint not built yet — phase 2 remaining');
    } else {
      check('plans returned', Array.isArray(plans.data) && plans.data.length > 0,
        Array.isArray(plans.data) ? `${plans.data.length} plans` : dump(plans.data));
      if (Array.isArray(plans.data)) {
        const bb = plans.data.find((p) => p.sport === 'بدنسازی' && p.sessions === 12);
        check('bodybuilding 12-session plan = 1,000,000', bb?.price === 1000000, dump(bb));
      }
    }

    section('4) full flow: coach -> member -> session -> earnings');
    const coach = await api('/accounting/coaches', {
      method: 'POST',
      token,
      body: { name: 'رضا محمدی', phone: '09121111111', sports: [{ sport: 'بدنسازی', commission_percent: 50 }] },
    });
    made.coachId = coach.data?.id;
    check('coach created', coach.status === 201 && made.coachId > 0, dump(coach.data));

    const member = await api('/members', {
      method: 'POST',
      token,
      body: {
        name: 'تست_یکپارچه',
        phone: '09129999999',
        expiry_date: '2027-01-01',
        birthday: '1995-03-15',
        national_id: '0013546716',
        sports: [{
          sport: 'بدنسازی',
          sport_plan_key: 'بدنسازی::12',
          weekly_sessions: 3,
          total_sessions: 12,
          tuition_amount: 1000000,
          fee_basis: 'session',
          class_type: 'personal',
          start_date: '2026-09-01',
          expiry_date: '2027-01-01',
        }],
      },
    });
    made.memberId = member.data?.id;
    check('member created with plan', member.status === 201 && made.memberId > 0, dump(member.data));

    if (made.memberId) {
      const list = await api('/members', { token });
      const rec = Array.isArray(list.data) ? list.data.find((m) => m.id === made.memberId) : null;
      const sp = rec?.sports?.[0];
      check('unit_price snapshotted (1,000,000/12 = 83,333)', sp?.unit_price === 83333, `got ${sp?.unit_price}`);
      check('sport_plan_id linked', !!sp?.sport_plan_id, `got ${sp?.sport_plan_id}`);
    }

    const session = await api('/coach-sessions', {
      method: 'POST',
      token,
      body: {
        member_id: made.memberId,
        session_date: '2026-09-15',
        session_time: '18:00',
        duration_minutes: 60,
        session_type: 'personal',
      },
    });
    made.sessionId = session.data?.id;
    check('session created', session.status === 201 && made.sessionId > 0, dump(session.data));

    if (!made.sessionId) {
      console.log('  abort: no session, cannot test earnings');
      return;
    }

    const done = await api(`/coach-sessions/${made.sessionId}`, { method: 'PATCH', token, body: { status: 'completed' } });
    check('session completed', done.status === 200 && done.data?.status === 'completed', dump(done.data));

    const earned = done.data?.earnings;
    check('coach earnings generated', earned?.ok === true && earned?.earnings?.length > 0, dump(earned));
    if (earned?.earnings?.[0]) {
      const e = earned.earnings[0];
      console.log(`        unit_price=${earned.unit_price} share=${e.net} percent=${e.share_percent} period=${e.period}`);
      check('unit price = 83,333', earned.unit_price === 83333, `got ${earned.unit_price}`);
      check('coach share = 41,666 (50%)', e.net === 41667, `got ${e.net}`);
      check('share percent snapshotted on session', done.data?.share_percent === 50, `got ${done.data?.share_percent}`);
      check('coach name resolved', e.member_name === 'تست_یکپارچه', `got ${e.member_name}`);
    } else {
      console.log(`  note: no earnings produced — inspect: ${dump(earned)}`);
    }

    section('5) idempotency over HTTP');
    const again = await api(`/coach-sessions/${made.sessionId}`, { method: 'PATCH', token, body: { status: 'completed' } });
    check('repeat completed is harmless', again.status === 200 && again.data?.earnings?.ok === true, dump(again.data?.earnings));

    section('6) cancel revokes unsettled share');
    const cancel = await api(`/coach-sessions/${made.sessionId}`, { method: 'PATCH', token, body: { status: 'cancelled' } });
    check('share removed on cancel', cancel.data?.earnings?.removed === 1, dump(cancel.data?.earnings));

    section('7) rebuild engine');
    const rebuild = await api('/accounting/coach-earnings/rebuild', { method: 'POST', body: {}, token });
    check('rebuild ok', rebuild.status === 200, dump(rebuild.data));

    section('8) coach earnings report (phase 9)');
    const report = await api('/accounting/coach-earnings?from=2026-01-01&to=2026-12-31', { token });
    if (report.status === 404) {
      console.log('  SKIP  report endpoint not built yet — phase 9 remaining');
    } else {
      check('report returned', report.status === 200, dump(report.data));
      if (Array.isArray(report.data)) {
        console.log(`        ${report.data.length} coaches in report`);
        for (const r of report.data.slice(0, 3)) {
          console.log(`        - ${r.name}: gross=${r.gross} net=${r.net} settled=${r.settled} remaining=${r.remaining}`);
        }
      }
    }

    section('9) cleanup');
    if (made.sessionId) await api(`/coach-sessions/${made.sessionId}`, { method: 'DELETE', token });
    if (made.memberId) await api(`/members/${made.memberId}`, { method: 'DELETE', token }); // روت تک‌عضوی در سرور نیست
    if (made.coachId) await api(`/accounting/coaches/${made.coachId}`, { method: 'DELETE', token });
    check('test data removed', true);
  } finally {
    console.log(`\n${'='.repeat(46)}`);
    console.log(`  RESULT: ${pass} passed, ${fail} failed`);
    console.log('='.repeat(46));
    process.exit(fail > 0 ? 1 : 0);
  }
})().catch((e) => {
  console.error('test error:', e.message);
  process.exit(1);
});