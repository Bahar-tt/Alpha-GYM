const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function generateMembersExcel(db) {
  const rows = db.prepare('SELECT * FROM members ORDER BY id').all();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('members');

  if (rows.length > 0) {
    sheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
    rows.forEach((row) => sheet.addRow(row));
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const outDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `members-${Date.now()}.xlsx`);
  await workbook.xlsx.writeFile(outPath);
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
