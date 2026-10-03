/**
 * test-coach-autofill.js — تست ذخیره خودکار مربی در فرم ثبت‌نام
 * سناریو: ثبت‌نام گروهی (خودکار) و ثبت‌نام خصوصی (انتخابی)
 */
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

let phoneSeq = 0;
let natSeq = 100;

/** کد ملی معتبر ایران (۹ رقم + رقم کنترلی) */
function validNationalId() {
  natSeq += 137;
  const p = String(natSeq).padStart(9, '0').slice(0, 9);
  const d = p.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += d[i] * (10 - i);
  const r = sum % 11;
  const c = r < 2 ? r : 11 - r;
  return `${p}${c}`;
}

async function createMember(token, sports, label) {
  phoneSeq += 1;
  const res = await api('/members', {
    method: 'POST',
    token,
    body: {
      name: `تست_مربی_${label}_${Date.now().toString().slice(-5)}`,
      phone: `091${String(20000000 + phoneSeq * 137 + Math.floor(Math.random() * 90)).padStart(8, '0')}`,
      expiry_date: '2027-01-01',
      birthday: '1995-03-15',
      national_id: validNationalId(),
      sports,
    },
  });
  return res;
}

async function readSport(token, memberId, sport) {
  const list = await api('/members', { token });
  const rec = (list.data || []).find((m) => m.id === memberId);
  return (rec?.sports || []).find((s) => s.sport === sport);
}

(async () => {
  const login = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  const token = login.data?.token;
  if (!token) { console.log('login failed'); process.exit(1); }
  await setFeature('accounting', true);
  check('login + accounting', true);

  section('1) گروهی + رشته تک‌مربی → خودکار');
  // یوگا فقط یک مربی دارد: زهرا جعفرنژاد
  let r = await createMember(token, [{
    sport: 'یوگا', sport_plan_key: 'یوگا::12', total_sessions: 12,
    tuition_amount: 800000, fee_basis: 'session', class_type: 'group',
    start_date: '2026-10-01', expiry_date: '2027-01-01',
  }], 'group1');
  check('عضو ساخته شد', r.status === 201, JSON.stringify(r.data).slice(0, 150));
  if (r.status === 201) {
    const sp = await readSport(token, r.data.id, 'یوگا');
    check('coach_id خودکار پر شد', !!sp?.coach_id, `got ${sp?.coach_id}`);
    check('نام مربی: زهرا جعفرنژاد', sp?.coach_name === 'زهرا جعفرنژاد', sp?.coach_name);
    await api(`/members/${r.data.id}`, { method: 'DELETE', token }).catch(() => {});
  }

  section('2) گروهی + رشته چندمربی → خالی می‌ماند');
  // بدنسازی ۲ مربی دارد → نباید خودکار انتخاب شود
  r = await createMember(token, [{
    sport: 'بدنسازی', sport_plan_key: 'بدنسازی::12', total_sessions: 12,
    tuition_amount: 1000000, fee_basis: 'session', class_type: 'group',
    start_date: '2026-10-01', expiry_date: '2027-01-01',
  }], 'group2');
  check('عضو ساخته شد', r.status === 201, JSON.stringify(r.data).slice(0, 150));
  if (r.status === 201) {
    const sp = await readSport(token, r.data.id, 'بدنسازی');
    check('coach_id خالی ماند (چند مربی)', sp?.coach_id == null, `got ${sp?.coach_id}`);
    await api(`/members/${r.data.id}`, { method: 'DELETE', token }).catch(() => {});
  }

  section('3) خصوصی + انتخاب صریح مربی');
  const bc = await api('/accounting/coaches/by-sport?sport=بدنسازی', { token });
  const reza = bc.data?.coaches?.find((c) => c.name.includes('خدابنده'));
  check('رضا پیدا شد', !!reza, JSON.stringify(bc.data?.coaches?.map((c) => c.name)));
  r = await createMember(token, [{
    sport: 'بدنسازی', sport_plan_key: 'بدنسازی::12', total_sessions: 12,
    tuition_amount: 1000000, fee_basis: 'session', class_type: 'private',
    coach_id: reza?.id,
    start_date: '2026-10-01', expiry_date: '2027-01-01',
  }], 'priv1');
  check('عضو ساخته شد', r.status === 201, JSON.stringify(r.data).slice(0, 150));
  if (r.status === 201) {
    const sp = await readSport(token, r.data.id, 'بدنسازی');
    check('مربی انتخابی ذخیره شد', sp?.coach_id === reza?.id, `got ${sp?.coach_id} want ${reza?.id}`);
    check('نام مربی ذخیره شد', sp?.coach_name === 'رها خدابنده لو', sp?.coach_name);
    await api(`/members/${r.data.id}`, { method: 'DELETE', token }).catch(() => {});
  }

  section('4) خصوصی + رشته تک‌مربی → خودکار');
  // TRX فقط مریم دارد
  r = await createMember(token, [{
    sport: 'TRX', sport_plan_key: 'TRX::12', total_sessions: 12,
    tuition_amount: 850000, fee_basis: 'session', class_type: 'private',
    start_date: '2026-10-01', expiry_date: '2027-01-01',
  }], 'priv2');
  check('عضو ساخته شد', r.status === 201, JSON.stringify(r.data).slice(0, 150));
  if (r.status === 201) {
    const sp = await readSport(token, r.data.id, 'TRX');
    check('مربی خودکار (مریم)', sp?.coach_name === 'مریم اردکانی زاده', sp?.coach_name);
    await api(`/members/${r.data.id}`, { method: 'DELETE', token }).catch(() => {});
  }

  section('5) دو رشته با دو مربی متفاوت');
  r = await createMember(token, [
    { sport: 'یوگا', sport_plan_key: 'یوگا::12', total_sessions: 12, tuition_amount: 800000, fee_basis: 'session', class_type: 'group', start_date: '2026-10-01', expiry_date: '2027-01-01' },
    { sport: 'بوکس', sport_plan_key: 'بوکس::12', total_sessions: 12, tuition_amount: 950000, fee_basis: 'session', class_type: 'group', start_date: '2026-10-01', expiry_date: '2027-01-01' },
  ], 'multi');
  check('عضو دو رشته‌ای ساخته شد', r.status === 201, JSON.stringify(r.data).slice(0, 150));
  if (r.status === 201) {
    const yoga = await readSport(token, r.data.id, 'یوگا');
    const boxing = await readSport(token, r.data.id, 'بوکس');
    check('یوگا → زهرا', yoga?.coach_name === 'زهرا جعفرنژاد', yoga?.coach_name);
    check('بوکس → مریم', boxing?.coach_name === 'مریم اردکانی زاده', boxing?.coach_name);
    check('دو مربی متفاوت', yoga?.coach_id !== boxing?.coach_id);
    await api(`/members/${r.data.id}`, { method: 'DELETE', token }).catch(() => {});
  }

  console.log(`\n${'='.repeat(46)}\n  RESULT: ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('err:', e.message, e.stack); process.exit(1); });