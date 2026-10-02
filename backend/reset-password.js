// reset-password.js — ابزار ریست رمز عبور از طریق خط فرمان
// اجرا: node reset-password.js <username> [new_password]

const Database = require('./sqlite-wrapper');
const crypto = require('crypto');
const path = require('path');

const db = new Database(path.join(__dirname, 'gym.db'));

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const username = process.argv[2] || 'admin';
const newPassword = process.argv[3] || 'admin123';

const staff = db.prepare('SELECT * FROM staff WHERE username = ?').get(username);
if (!staff) {
  console.error(`❌ کاربر "${username}" پیدا نشد`);
  process.exit(1);
}

db.prepare('UPDATE staff SET password_hash = ? WHERE id = ?')
  .run(hashPassword(newPassword), staff.id);

console.log(`✅ رمز عبور "${username}" با موفقیت تغییر کرد`);
console.log(`   رمز جدید: ${newPassword}`);
