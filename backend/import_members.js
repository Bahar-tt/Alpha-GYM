const Database = require('better-sqlite3');
const path = require('path');
const AdmZip = require('adm-zip');
const { DOMParser } = require('@xmldom/xmldom');

const DB_PATH  = path.join(__dirname, 'gym.db');
const XLS_PATH = path.join(__dirname, 'PersonList.xls');

function cleanXml(str) {
  // حذف BOM و کاراکترهای اضافی قبل از <?xml
  return str.replace(/^\uFEFF/, '').replace(/^[^<]*/, '');
}

function parseXlsx(filePath) {
  const zip = new AdmZip(filePath);
  const parser = new DOMParser();

  // Shared strings
  const ssRaw  = zip.getEntry('xl/sharedStrings.xml').getData().toString('utf8');
  const ssDoc  = parser.parseFromString(cleanXml(ssRaw), 'text/xml');
  const siNodes = ssDoc.getElementsByTagName('si');
  const strings = [];
  for (let i = 0; i < siNodes.length; i++) {
    const tNodes = siNodes[i].getElementsByTagName('t');
    let text = '';
    for (let j = 0; j < tNodes.length; j++) text += tNodes[j].textContent || '';
    strings.push(text);
  }

  // Sheet
  const shRaw  = zip.getEntry('xl/worksheets/sheet1.xml').getData().toString('utf8');
  const shDoc  = parser.parseFromString(cleanXml(shRaw), 'text/xml');
  const rowNodes = shDoc.getElementsByTagName('row');

  const rows = [];
  for (let i = 0; i < rowNodes.length; i++) {
    const cells = {};
    const cNodes = rowNodes[i].getElementsByTagName('c');
    for (let j = 0; j < cNodes.length; j++) {
      const c   = cNodes[j];
      const ref = (c.getAttribute('r') || '').replace(/[0-9]/g, '');
      const t   = c.getAttribute('t') || '';
      const vNode = c.getElementsByTagName('v')[0];
      if (vNode && ref) {
        const raw = vNode.textContent;
        cells[ref] = t === 's' ? strings[parseInt(raw)] : raw;
      }
    }
    rows.push(cells);
  }
  return rows;
}

function main() {
  console.log('📂 Reading Excel file...');
  const rows = parseXlsx(XLS_PATH);
  console.log(`✅ Found ${rows.length - 1} data rows`);

  const db = new Database(DB_PATH);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO members (name, phone, expiry_date, weekly_sessions, birthday)
    VALUES (?, ?, ?, ?, ?)
  `);

  const importAll = db.transaction((dataRows) => {
    let success = 0, skipped = 0;
    for (const row of dataRows) {
      const name     = (row['E'] || '').trim();
      const phone    = (row['I'] || '').trim();
      const bday     = (row['H'] || '').trim();

      if (!name || !phone || phone.length < 10) { skipped++; continue; }

      const birthday = (bday && bday !== '1310/01/01') ? bday : null;

      insert.run(name, phone, '2020-01-01', 0, birthday);
      success++;
    }
    return { success, skipped };
  });

  const result = importAll(rows.slice(1));
  console.log(`\n✅ موفق: ${result.success}`);
  console.log(`⏭  رد شده: ${result.skipped}`);
  console.log(`\n⚠️  همه اعضا غیرفعال هستند — تاریخ انقضا رو از پنل ادیت کن`);
}

main();