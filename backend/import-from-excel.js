/**
 * Import members + coaches from Excel into Alpha-GYM-bahar SQLite DB.
 *
 * Usage (from backend folder, server STOPPED):
 *   node import-from-excel.js "C:\path\PersonList.xls" "C:\path\coaches.xlsx"
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const Database = require('./sqlite-wrapper');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'gym.db');
const membersFile = process.argv[2] || path.join(__dirname, 'PersonList.xls');
const coachesFile = process.argv[3] || path.join(__dirname, 'coaches.xlsx');

function normPhone(p) {
  if (p == null || p === '') return '';
  let s = String(p).replace(/[^\d]/g, '');
  if (s.startsWith('98') && s.length >= 12) s = '0' + s.slice(2);
  if (s.length === 10 && s.startsWith('9')) s = '0' + s;
  return s;
}

function cleanName(n) {
  return String(n || '')
    .replace(/^خانم\s+/u, '')
    .replace(/^آقای\s+/u, '')
    .trim();
}

function jalaliToIsoGuess(j) {
  if (!j) return null;
  const s = String(j).trim().replace(/-/g, '/');
  const m = s.match(/^(\d{3,4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return s;
}

function hasIns(v) {
  if (v == null) return 0;
  const s = String(v);
  return /بیمه|دارد|yes|1/i.test(s) ? 1 : 0;
}

function expiryDefault() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function startDefault() {
  return new Date().toISOString().slice(0, 10);
}

console.log('[IMPORT] DB =', DB_PATH);
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    start_date TEXT,
    weekly_sessions INTEGER NOT NULL DEFAULT 0,
    birthday TEXT,
    national_id TEXT,
    referrer TEXT,
    sport TEXT,
    tuition_amount INTEGER,
    fee_basis TEXT,
    class_type TEXT,
    has_insurance INTEGER NOT NULL DEFAULT 0,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    used_sessions INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    membership_type TEXT,
    goal TEXT,
    member_code TEXT
  );
  CREATE TABLE IF NOT EXISTS member_sports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    sport TEXT NOT NULL DEFAULT '',
    sport_plan_key TEXT,
    weekly_sessions INTEGER NOT NULL DEFAULT 0,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    used_sessions INTEGER NOT NULL DEFAULT 0,
    tuition_amount INTEGER,
    fee_basis TEXT,
    class_type TEXT,
    start_date TEXT,
    expiry_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS coaches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const cols = db.prepare(`PRAGMA table_info(members)`).all().map((c) => c.name);
for (const [col, def] of [
  ['member_code', 'TEXT'],
  ['national_id', 'TEXT'],
  ['has_insurance', 'INTEGER NOT NULL DEFAULT 0'],
  ['membership_type', 'TEXT'],
  ['notes', 'TEXT'],
  ['birthday', 'TEXT'],
  ['start_date', 'TEXT'],
  ['total_sessions', 'INTEGER NOT NULL DEFAULT 0'],
  ['used_sessions', 'INTEGER NOT NULL DEFAULT 0'],
]) {
  if (!cols.includes(col)) {
    try {
      db.exec(`ALTER TABLE members ADD COLUMN ${col} ${def}`);
    } catch (_) {}
  }
}

let membersImported = 0;
let coachesImported = 0;
let skipped = 0;

if (fs.existsSync(membersFile)) {
  console.log('[IMPORT] Reading members:', membersFile);
  const wb = XLSX.readFile(membersFile);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const insMember = db.prepare(`
    INSERT INTO members (
      name, phone, expiry_date, start_date, weekly_sessions,
      birthday, national_id, has_insurance, membership_type,
      member_code, total_sessions, used_sessions, notes, sport
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 12, 0, ?, ?)
  `);

  const insSport = db.prepare(`
    INSERT INTO member_sports (
      member_id, sport, weekly_sessions, total_sessions, used_sessions,
      fee_basis, class_type, start_date, expiry_date
    ) VALUES (?, '', 3, 12, 0, 'monthly', 'group', ?, ?)
  `);

  const findByCode = db.prepare(`SELECT id FROM members WHERE member_code = ?`);
  const findByPhone = db.prepare(`SELECT id FROM members WHERE phone = ? AND phone != ''`);

  const run = db.transaction((list) => {
    for (const r of list) {
      const type = String(r['نوع عضویت'] || '').trim();
      const codeRaw = r['کد عضویت'];
      const code =
        codeRaw === '' || codeRaw == null || Number.isNaN(Number(codeRaw))
          ? null
          : String(Math.round(Number(codeRaw)));

      const name = cleanName(r['نام و نام خانوداگی']);
      if (!name) {
        skipped++;
        continue;
      }

      if (type && /مربی|پرسنل|کاربر/u.test(type) && !/ورزشکار/u.test(type)) {
        skipped++;
        continue;
      }

      const phone = normPhone(r['موبایل'] || r['تلفن']);
      const nid =
        r['کد ملی'] != null && r['کد ملی'] !== ''
          ? String(Math.round(Number(r['کد ملی']))).padStart(10, '0')
          : null;
      const birthday = jalaliToIsoGuess(r['تاریخ تولد']);
      const insurance = hasIns(r['بیمه']);
      const start = startDefault();
      const expiry = expiryDefault();

      if (code) {
        const ex = findByCode.get(code);
        if (ex) {
          skipped++;
          continue;
        }
      }
      if (phone) {
        const ex2 = findByPhone.get(phone);
        if (ex2) {
          skipped++;
          continue;
        }
      }

      const info = insMember.run(
        name,
        phone || '09000000000',
        expiry,
        start,
        birthday,
        nid,
        insurance,
        'monthly',
        code,
        type || null,
        null
      );
      insSport.run(info.lastInsertRowid, start, expiry);
      membersImported++;
    }
  });

  run(rows);
  console.log(`[IMPORT] members inserted: ${membersImported}, skipped: ${skipped}`);
} else {
  console.log('[IMPORT] members file not found:', membersFile);
}

if (fs.existsSync(coachesFile)) {
  console.log('[IMPORT] Reading coaches:', coachesFile);
  const wb = XLSX.readFile(coachesFile);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const insCoach = db.prepare(`INSERT INTO coaches (name, phone, is_active) VALUES (?, ?, 1)`);
  const findCoach = db.prepare(`SELECT id FROM coaches WHERE name = ?`);

  let insCS = null;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS coach_sports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coach_id INTEGER NOT NULL,
        sport TEXT NOT NULL,
        commission_percent INTEGER NOT NULL DEFAULT 0,
        commission_amount INTEGER
      )
    `);
    insCS = db.prepare(
      `INSERT INTO coach_sports (coach_id, sport, commission_percent) VALUES (?, ?, ?)`
    );
  } catch (_) {}

  for (const r of rows) {
    const name = cleanName(r['نام مربی'] || r['name']);
    if (!name) continue;
    if (findCoach.get(name)) continue;
    const phone = normPhone(r['شماره تماس'] || r['phone']);
    const sport = String(r['رشته فعالیت'] || '').trim();
    let pct = Number(r['درصد دریافتی']);
    if (pct > 0 && pct <= 1) pct = Math.round(pct * 100);
    if (!pct) pct = 50;

    const info = insCoach.run(name, phone || null);
    if (insCS && sport) {
      for (const s of sport.split('+').map((x) => x.trim()).filter(Boolean)) {
        insCS.run(info.lastInsertRowid, s, pct);
      }
    }
    coachesImported++;
  }
  console.log(`[IMPORT] coaches inserted: ${coachesImported}`);
} else {
  console.log('[IMPORT] coaches file not found:', coachesFile);
}

const mc = db.prepare(`SELECT COUNT(*) AS c FROM members`).get().c;
const cc = db.prepare(`SELECT COUNT(*) AS c FROM coaches`).get().c;
const sample = db
  .prepare(`SELECT member_code, name FROM members WHERE member_code = '16' LIMIT 1`)
  .get();
console.log(`[IMPORT] totals → members=${mc}, coaches=${cc}`);
console.log('[IMPORT] sample code 16:', sample || '(not found)');
console.log('[IMPORT] done. Start server: npm start');
