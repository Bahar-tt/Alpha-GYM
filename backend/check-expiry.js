// check-expiry.js

const Database = require('better-sqlite3');

const db = new Database('./gym.db');

const rows = db.prepare(`
SELECT
 id,
 name,
 expiry_date
FROM members
`).all();

console.log(rows);