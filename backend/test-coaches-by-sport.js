/** تست endpoint مربیان یک رشته */
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

(async () => {
  const login = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  const token = login.data?.token;
  if (!token) { console.log('login failed', JSON.stringify(login.data)); process.exit(1); }
  await setFeature('accounting', true);
  check('admin logged in + accounting on', true);

  section('1) رشته با یک مربی → پیش‌فرض خودکار');
  let r = await api('/accounting/coaches/by-sport?sport=یوگا', { token });
  check('یوگا برگشت', r.status === 200, JSON.stringify(r.data).slice(0, 200));
  check('۱ مربی (زهرا جعفرنژاد)', r.data?.coaches?.length === 1, `got ${r.data?.coaches?.length}`);
  check('default_coach_id داده شد', !!r.data?.default_coach_id, String(r.data?.default_coach_id));
  console.log(`     → ${r.data?.coaches?.[0]?.name} (${r.data?.coaches?.[0]?.share_percent}%)`);

  section('2) رشته با چند مربی');
  r = await api('/accounting/coaches/by-sport?sport=کراسفیت', { token });
  check('کراسفیت ۲ مربی دارد', r.data?.coaches?.length === 2, `got ${r.data?.coaches?.length}`);
  check('نام رشته استاندارد شد (کراس‌فیت)', r.data?.sport === 'کراس‌فیت', r.data?.sport);
  check('default_coach_id null (چند مربی)', r.data?.default_coach_id === null, String(r.data?.default_coach_id));
  console.log(`     → ${r.data?.coaches?.map((c) => c.name).join(' + ')}`);

  section('3) تطبیق با نیم‌فاصله/فاصله');
  r = await api('/accounting/coaches/by-sport?sport=' + encodeURIComponent('فری استایل'), { token });
  check('«فری استایل» → مربی دارد', r.data?.coaches?.length >= 1, JSON.stringify(r.data).slice(0, 150));
  console.log(`     → ${r.data?.coaches?.map((c) => c.name).join(', ')}`);

  section('4) قابلیت‌ها');
  const bb = await api('/accounting/coaches/by-sport?sport=بدنسازی', { token });
  const fatemeh = bb.data?.coaches?.find((c) => c.name.includes('طباطبایی'));
  const reza = bb.data?.coaches?.find((c) => c.name.includes('خدابنده'));
  check('بدنسازی ۲ مربی', bb.data?.coaches?.length === 2, `got ${bb.data?.coaches?.length}`);
  check('فاطمه can_program=true', fatemeh?.can_program === true, String(fatemeh?.can_program));
  check('رها can_program=true', reza?.can_program === true, String(reza?.can_program));
  check('همه can_private=true', bb.data?.coaches?.every((c) => c.can_private === true));

  section('5) رشته بدون مربی');
  r = await api('/accounting/coaches/by-sport?sport=اریال', { token });
  check('اریال مربی ندارد → آرایه خالی', Array.isArray(r.data?.coaches) && r.data.coaches.length === 0, JSON.stringify(r.data).slice(0, 120));

  section('6) ورودی خالی');
  r = await api('/accounting/coaches/by-sport?sport=', { token });
  check('رشته خالی → 400', r.status === 400, String(r.status));

  console.log(`\n${'='.repeat(46)}\n  RESULT: ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('err:', e.message); process.exit(1); });