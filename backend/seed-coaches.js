/**
 * Seed مربیان واقعی باشگاه
 * اجرا: از پوشه backend → node seed-coaches.js
 */
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'gym.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS coaches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT,
    specialty TEXT,
    commission_percent REAL DEFAULT 30,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    has_insurance INTEGER DEFAULT 0,
    insurance_notes TEXT,
    referrer_name TEXT,
    referral_source TEXT,
    training_goal TEXT,
    photo_url TEXT,
    national_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// درصد دریافتی در فایل اکسل ۰.۵ = ۵۰٪
const coaches = [
  { full_name: 'فاطمه طباطبایی زاده', phone: '09054535008', specialty: 'بدنسازی', commission_percent: 50, national_id: '4570154565', notes: 'برنامه تمرینی: دارد | خصوصی: دارد' },
  { full_name: 'فاطمه میری', phone: '09382619988', specialty: 'فانکشنال فیتنس + فری استایل', commission_percent: 50, national_id: '4579927419', notes: 'خصوصی: دارد' },
  { full_name: 'الهام دانشفر', phone: '09129530677', specialty: 'هایروکس + بادی پامپ', commission_percent: 50, national_id: '4570020399', notes: 'خصوصی: دارد' },
  { full_name: 'زهرا جعفرنژاد', phone: '09113938010', specialty: 'یوگا', commission_percent: 50, national_id: '4579372018', notes: 'خصوصی: دارد' },
  { full_name: 'مطهره طوسی', phone: '09923735593', specialty: 'پیلاتس', commission_percent: 50, national_id: '4570143296', notes: 'خصوصی: دارد' },
  { full_name: 'انسیه حسین پوران', phone: '09125327345', specialty: 'کراسفیت', commission_percent: 50, national_id: '6359670496', notes: 'خصوصی: دارد' },
  { full_name: 'اکرم مجاور', phone: '09127327366', specialty: 'ایروفیتنس', commission_percent: 50, national_id: '4579334760', notes: 'خصوصی: دارد' },
  { full_name: 'سارا سوهانی', phone: '09360765406', specialty: 'زومبا', commission_percent: 50, national_id: '0022602580', notes: 'خصوصی: دارد' },
  { full_name: 'نازنین رضایی', phone: '09114593326', specialty: 'رقص ایرانی', commission_percent: 50, national_id: '4570092837', notes: 'خصوصی: دارد' },
  { full_name: 'رها خدابنده لو', phone: '09192328364', specialty: 'کراسفیت + بدنسازی', commission_percent: 50, national_id: '', notes: 'برنامه تمرینی: دارد | خصوصی: دارد' },
  { full_name: 'مریم اردکانی زاده', phone: '', specialty: 'بوکس + TRX', commission_percent: 50, national_id: '4579930894', notes: 'خصوصی: دارد' },
];

const insert = db.prepare(`
  INSERT INTO coaches (full_name, phone, specialty, commission_percent, notes, is_active, national_id)
  VALUES (@full_name, @phone, @specialty, @commission_percent, @notes, 1, @national_id)
`);

const existing = db.prepare('SELECT full_name FROM coaches').all().map((r) => r.full_name);
let added = 0;
for (const c of coaches) {
  if (existing.includes(c.full_name)) {
    console.log('رد (قبلاً هست):', c.full_name);
    continue;
  }
  insert.run(c);
  added++;
  console.log('اضافه شد:', c.full_name, '—', c.specialty);
}

console.log('\nتمام. تعداد جدید:', added, '| کل مربیان در دیتابیس:', db.prepare('SELECT COUNT(*) as n FROM coaches').get().n);
db.close();
