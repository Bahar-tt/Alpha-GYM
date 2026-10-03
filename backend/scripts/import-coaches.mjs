/**
 * import-coaches.mjs — وارد کردن لیست مربیان از اکسل به دیتابیس
 *
 * منبع: Downloads/مربی.xlsx
 * ستون‌ها: نام مربی | کد ملی | شماره تماس | رشته فعالیت | درصد دریافتی |
 *          برنامه تمرینی | خصوصی
 *
 * اجرا (یک‌بار): node backend/scripts/import-coaches.mjs [مسیر فایل]
 * پیش‌نیاز: بک‌اند متوقف باشد (فایل db را باز می‌کند)
 */

import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));   // .../backend/scripts
const BACKEND = path.resolve(HERE, '..');                     // .../backend
const Database = require(path.join(BACKEND, 'sqlite-wrapper.js'));
const db = new Database(path.join(BACKEND, 'gym.db'));

const XLSX_PATH = process.argv[2]
  || path.join(process.env.USERPROFILE || 'C:/Users/KEYHAN', 'Downloads', 'مربی.xlsx');

if (!fs.existsSync(XLSX_PATH)) {
  console.error(`فایل پیدا نشد: ${XLSX_PATH}`);
  process.exit(1);
}

// ── نگاشت ستون‌ها (اکسل فارسی است) ──
const COL = {
  name: 'نام مربی',
  nationalId: 'کد ملی',
  phone: 'شماره تماس',
  sport: 'رشته فعالیت',
  percent: 'درصد دریافتی',
  program: 'برنامه تمرینی',
  priv: 'خصوصی',
};

function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s && s !== '-' ? s : null;
}

function toEnDigits(s) {
  return s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function normalizePhone(v) {
  if (!v) return null;
  const digits = toEnDigits(String(v)).replace(/\D/g, '');
  if (digits.length === 10) return `0${digits}`;      // 9054535008 → 09054535008
  if (digits.length === 11) return digits;
  return digits || null;
}

function normalizeNationalId(v) {
  if (!v) return null;
  const d = toEnDigits(String(v)).replace(/\D/g, '');
  return d.length === 10 ? d : null;
}

function isValidNationalId(id) {
  if (!id || !/^\d{10}$/.test(id)) return false;
  if (/^(\d)\1{9}$/.test(id)) return false;
  const digits = id.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += digits[i] * (10 - i);
  const r = sum % 11;
  const c = r < 2 ? r : 11 - r;
  return c === digits[9];
}

/** «فانکشنال فیتنس + فری استایل» → ['فانکشنال فیتنس', 'فری استایل'] */
function parseSports(v) {
  if (!v) return [];
  return String(v)
    .split(/[+,،/|]|\s+و\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** «50%» → 50 */
function parsePercent(v) {
  if (v == null) return 50;
  const n = parseInt(toEnDigits(String(v)).replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 50;
}

function isYes(v) {
  return str(v) === 'دارد';
}

// ── ستون‌های جدید مربی (idempotent) ──
const coachCols = db.prepare('PRAGMA table_info(coaches)').all().map((c) => c.name);
for (const [col, def] of [
  ['national_id',   'TEXT'],
  ['can_private',   'INTEGER NOT NULL DEFAULT 1'],
  ['can_program',   'INTEGER NOT NULL DEFAULT 0'],
  ['joined_at',     'TEXT'],
  ['hourly_rate',   'INTEGER NOT NULL DEFAULT 0'],
]) {
  if (!coachCols.includes(col)) {
    db.exec(`ALTER TABLE coaches ADD COLUMN ${col} ${def}`);
    console.log(`[MIGRATE] coaches.${col} added`);
  }
}

const csCols = db.prepare('PRAGMA table_info(coach_sports)').all().map((c) => c.name);
for (const [col, def] of [
  ['share_percent', 'INTEGER NOT NULL DEFAULT 50'],
  ['gym_percent',   'INTEGER'],
  ['hourly_rate',   'INTEGER'],
]) {
  if (!csCols.includes(col)) {
    db.exec(`ALTER TABLE coach_sports ADD COLUMN ${col} ${def}`);
    console.log(`[MIGRATE] coach_sports.${col} added`);
  }
}

// ── خواندن اکسل ──
const wb = XLSX.readFile(XLSX_PATH);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: false });
console.log(`\n${rows.length} سطر از ${XLSX_PATH} خوانده شد\n`);

const findCoach = db.prepare('SELECT * FROM coaches WHERE name = ? COLLATE NOCASE');
const insertCoach = db.prepare(`
  INSERT INTO coaches
    (name, phone, national_id, is_active, pay_model, default_share, monthly_salary,
     can_private, can_program, joined_at, notes)
  VALUES (?, ?, ?, 1, 'share', ?, 0, ?, ?, date('now'), ?)
`);
const updateCoach = db.prepare(`
  UPDATE coaches SET phone = ?, national_id = ?, default_share = ?, can_private = ?, can_program = ? WHERE id = ?
`);
const delSports = db.prepare('DELETE FROM coach_sports WHERE coach_id = ?');
const insertSport = db.prepare(`
  INSERT INTO coach_sports (coach_id, sport, commission_percent, share_percent, gym_percent)
  VALUES (?, ?, ?, ?, ?)
`);

const stats = { created: 0, updated: 0, skipped: 0, badNat: 0, sports: 0 };

const run = db.transaction(() => {
  for (const row of rows) {
    let action = '';
    const name = str(row[COL.name]);
    if (!name) { stats.skipped += 1; continue; }

    const phone = normalizePhone(row[COL.phone]);
    const rawNat = normalizeNationalId(row[COL.nationalId]);
    const natId = rawNat && isValidNationalId(rawNat) ? rawNat : null;
    if (rawNat && !natId) stats.badNat += 1;

    const pct = parsePercent(row[COL.percent]);
    const canPriv = isYes(row[COL.priv]) ? 1 : 0;
    const canProg = isYes(row[COL.program]) ? 1 : 0;
    const sports = parseSports(row[COL.sport]);

    const existing = findCoach.get(name);
    let coachId;
    if (existing) {
      coachId = existing.id;
      updateCoach.run(phone, natId, pct, canPriv, canProg, coachId);
      stats.updated += 1;
      action = 'updated';
    } else {
      coachId = Number(insertCoach.run(name, phone, natId, pct, canPriv, canProg, `وارد شده از ${XLSX_PATH}`).lastInsertRowid);
      stats.created += 1;
      action = 'created';
    }

    // رشته‌ها (با درصد سهم یکسان برای همه رشته‌های آن مربی)
    delSports.run(coachId);
    for (const sp of sports) {
      insertSport.run(coachId, sp, pct, pct, 100 - pct);
      stats.sports += 1;
    }

    console.log(
      `  ${action.padEnd(7)} ${name.padEnd(24)} ` +
      `${String(phone || '—').padEnd(12)} ${natId || 'کدملی—'.padEnd(11)} ` +
      `${pct}%  برنامه:${canProg ? '✓' : '✗'}  [${sports.join(' | ')}]`
    );
  }
});

run();

console.log(`\n${'─'.repeat(52)}`);
console.log(`  جدید: ${stats.created}   به‌روزرسانی: ${stats.updated}   رد شده: ${stats.skipped}`);
console.log(`  رشته ثبت‌شده: ${stats.sports}   کد ملی نامعتبر: ${stats.badNat}`);
console.log(`${'─'.repeat(52)}`);
