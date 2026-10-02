// setup-db.js — ساخت جداول و کاربران پیش‌فرض
const Database = require('./sqlite-wrapper');
const crypto = require('crypto');
const path = require('path');

const db = new Database(path.join(__dirname, 'gym.db'));

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// جداول اصلی
db.exec(`CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'staff',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  staff_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  member_id INTEGER,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// کاربران پیش‌فرض
const insStaff = db.prepare('INSERT OR IGNORE INTO staff (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)');
insStaff.run('admin', hashPassword('admin123'), 'مدیر سیستم', 'admin');
insStaff.run('staff', hashPassword('staff123'), 'منشی', 'staff');

// فلگ‌های ویژگی
const insFlag = db.prepare('INSERT OR IGNORE INTO feature_flags (key, enabled) VALUES (?, ?)');
insFlag.run('accounting', 0);
insFlag.run('attendance', 0);
insFlag.run('coach_portal', 0);
insFlag.run('messaging', 0);

console.log('✅ جداول ساخته شدند');
console.log('کاربران:', db.prepare('SELECT id, username, role FROM staff').all());
db.close();
