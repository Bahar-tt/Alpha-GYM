// check-members.js

const Database = require('better-sqlite3');

const db = new Database('./gym.db');

const rows = db.prepare(`
PRAGMA table_info(members)
`).all();

console.log(rows);