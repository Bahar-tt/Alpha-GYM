/**
 * وارد کردن اعضا از فایل members-import.json
 *
 * مراحل:
 *   1) فایل members-import.json را داخل پوشه backend بگذارید
 *      (همان فایلی که از چت دانلود می‌کنید)
 *   2) در PowerShell:
 *        cd E:\Alpha-GYM\backend
 *        node seed-members.js
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'gym.db');
const candidates = [
  path.join(__dirname, 'members-import.json'),
  path.join(__dirname, '..', 'members-import.json'),
  path.join(process.cwd(), 'members-import.json'),
];

const jsonPath = candidates.find((p) => fs.existsSync(p));
if (!jsonPath) {
  console.error('فایل members-import.json پیدا نشد.');
  console.error('آن را داخل پوشه backend بگذارید، سپس دوباره اجرا کنید.');
  process.exit(1);
}

console.log('خواندن از:', jsonPath);
const members = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
if (!Array.isArray(members) || members.length === 0) {
  console.error('فایل خالی یا نامعتبر است.');
  process.exit(1);
}
console.log('تعداد رکورد در فایل:', members.length);

const db = new Database(dbPath);

db.exec(`CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
  expiry_date TEXT NOT NULL, weekly_sessions INTEGER NOT NULL DEFAULT 0,
  birthday TEXT, personnel_code TEXT, coach_name TEXT, attendance_count INTEGER NOT NULL DEFAULT 0,
  membership_type TEXT DEFAULT 'monthly', start_date TEXT
)`);

const cols = db.prepare('PRAGMA table_info(members)').all().map((c) => c.name);
function addCol(n, d) {
  if (!cols.includes(n)) db.exec(`ALTER TABLE members ADD COLUMN ${n} ${d}`);
}
[
  'personnel_code TEXT', 'coach_name TEXT', 'attendance_count INTEGER NOT NULL DEFAULT 0',
  "membership_type TEXT DEFAULT 'monthly'", 'start_date TEXT', 'coach_id INTEGER',
  'monthly_fee REAL DEFAULT 0', 'coach_commission_percent REAL DEFAULT 0',
  'has_insurance INTEGER DEFAULT 0', 'insurance_notes TEXT', 'referrer_name TEXT',
  'referral_source TEXT', 'training_goal TEXT', 'photo_url TEXT', 'national_id TEXT',
  'father_name TEXT', 'sport TEXT', 'height_cm REAL', 'weight_kg REAL', 'sports_json TEXT',
].forEach((s) => {
  const [n, ...rest] = s.split(' ');
  addCol(n, rest.join(' '));
});

function todayIso() {
  return new Date().toISOString().split('T')[0];
}
function plusMonthsIso(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

const existingNid = new Set(
  db.prepare("SELECT national_id FROM members WHERE national_id IS NOT NULL AND national_id != ''").all().map((r) => r.national_id),
);
const existingPhone = new Set(
  db.prepare("SELECT phone FROM members WHERE phone IS NOT NULL AND phone != ''").all().map((r) => r.phone),
);
const existingPc = new Set(
  db.prepare("SELECT personnel_code FROM members WHERE personnel_code IS NOT NULL AND personnel_code != ''").all().map((r) => r.personnel_code),
);

const insert = db.prepare(`
  INSERT INTO members (
    name, phone, expiry_date, weekly_sessions, birthday, personnel_code,
    membership_type, start_date, national_id, father_name, has_insurance, monthly_fee
  ) VALUES (
    @name, @phone, @expiry_date, @weekly_sessions, @birthday, @personnel_code,
    @membership_type, @start_date, @national_id, @father_name, @has_insurance, 0
  )
`);

const start = todayIso();
const expiry = plusMonthsIso(1);

let added = 0;
let skipped = 0;

const tx = db.transaction((list) => {
  for (const m of list) {
    const name = (m.name || '').trim();
    if (!name) { skipped++; continue; }
    const phone = (m.phone || '').trim() || '00000000000';
    const nid = (m.national_id || '').trim();
    const pc = (m.personnel_code || '').trim();

    if (nid && existingNid.has(nid)) { skipped++; continue; }
    if (phone && phone !== '00000000000' && existingPhone.has(phone)) { skipped++; continue; }
    if (pc && existingPc.has(pc)) { skipped++; continue; }

    insert.run({
      name,
      phone,
      expiry_date: expiry,
      weekly_sessions: 3,
      birthday: (m.birthday || '').trim() || null,
      personnel_code: pc || null,
      membership_type: 'monthly',
      start_date: start,
      national_id: nid || null,
      father_name: (m.father_name || '').trim() || null,
      has_insurance: m.has_insurance ? 1 : 0,
    });

    if (nid) existingNid.add(nid);
    if (phone && phone !== '00000000000') existingPhone.add(phone);
    if (pc) existingPc.add(pc);
    added++;
  }
});

tx(members);

const total = db.prepare('SELECT COUNT(*) as n FROM members').get().n;
console.log('اضافه شد:', added);
console.log('رد شد (تکراری/خالی):', skipped);
console.log('کل اعضا در دیتابیس:', total);
db.close();
