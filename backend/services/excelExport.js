const XLSX = require('xlsx');
const Database = require('../sqlite-wrapper');
const path = require('path');
const fs = require('fs');

function generateMembersExcel(db) {
  const rows = db.prepare('SELECT * FROM members ORDER BY id').all();
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'members');
  const outDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `members-${Date.now()}.xlsx`);
  XLSX.writeFile(wb, outPath);
  return outPath;
}

function latestExportPath() {
  const outDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(outDir)) return null;
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.xlsx')).sort();
  if (!files.length) return null;
  return path.join(outDir, files[files.length - 1]);
}

module.exports = { generateMembersExcel, latestExportPath };
