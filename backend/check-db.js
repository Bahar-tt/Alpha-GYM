const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'gym.db'));

const tables = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table'
`).all();

console.log('TABLES:', tables);

const logs = db.prepare(`
  SELECT * FROM sms_logs ORDER BY id DESC
`).all();

console.log('\nSMS LOGS:\n', logs);