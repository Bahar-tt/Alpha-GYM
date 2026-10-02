const XLSX = require('xlsx');
const Database = require('../sqlite-wrapper');
const path = require('path');
const fs = require('fs');
const moment = require('jalali-moment');

const DB_PATH = path.join(__dirname, '../gym.db');
const EXPORT_DIR = path.join(__dirname, '../exports');

const db = new Database(DB_PATH);

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function toJalali(iso) {
  if (!iso) return '';
  const m = moment(String(iso), 'YYYY-MM-DD');
  if (!m.isValid()) return String(iso);
  return m.locale('fa').format('YYYY/MM/DD');
}

function classTypeLabel(v) {
  if (v === 'private') return 'خصوصی';
  if (v === 'personal') return 'شخصی';
  if (v === 'group') return 'گروهی';
  return v || '';
}

function feeBasisLabel(v) {
  if (v === 'session') return 'جلسه‌ای';
  if (v === 'monthly') return 'ماهانه';
  return v || '';
}

function generateMembersExcel() {
  // ✅ مدل چندرشته‌ای: یک سطر به‌ازای هر اشتراک ورزشی (هر عضو می‌تواند چند رشته داشته باشد)
  const rows = db.prepare(`
    SELECT ms.*, m.name, m.phone, m.national_id, m.birthday, m.has_insurance, m.referrer, m.notes
    FROM member_sports ms
    JOIN members m ON m.id = ms.member_id
    ORDER BY m.name, ms.id
  `).all();
  const today = todayIso();

  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }

  const aoa = [[
    'شناسه',
    'نام و نام خانوادگی',
    'تلفن',
    'کد ملی',
    'تاریخ تولد',
    'رشته ورزشی',
    'نحوه پرداخت',
    'نوع کلاس',
    'شهریه (تومان)',
    'بیمه ورزشی',
    'جلسات هفتگی',
    'کل جلسات',
    'جلسات استفاده‌شده',
    'تاریخ شروع قرارداد',
    'تاریخ پایان قرارداد',
    'وضعیت',
    'نام معرف',
    'یادداشت',
  ]];

  rows.forEach((r) => {
    const active = r.expiry_date >= today;
    aoa.push([
      r.member_id,
      r.name,
      r.phone,
      r.national_id || '',
      toJalali(r.birthday),
      r.sport || '',
      feeBasisLabel(r.fee_basis),
      classTypeLabel(r.class_type),
      r.tuition_amount != null ? r.tuition_amount : '',
      r.has_insurance ? 'دارد' : 'ندارد',
      r.weekly_sessions ?? 0,
      r.total_sessions ?? 0,
      r.used_sessions ?? 0,
      toJalali(r.start_date),
      toJalali(r.expiry_date),
      active ? 'فعال' : 'غیرفعال',
      r.referrer || '',
      r.notes || '',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 6 }, { wch: 24 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
    { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 16 }, { wch: 30 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'اعضا');

  const date = today;
  const datedFile = path.join(EXPORT_DIR, `members-${date}.xlsx`);
  const latestFile = path.join(EXPORT_DIR, 'members-latest.xlsx');

  XLSX.writeFile(wb, datedFile);
  XLSX.writeFile(wb, latestFile);

  return {
    filename: `members-${date}.xlsx`,
    updated_at: new Date().toISOString(),
    count: rows.length,
  };
}

function latestExportPath() {
  if (!fs.existsSync(EXPORT_DIR)) return null;
  const latest = path.join(EXPORT_DIR, 'members-latest.xlsx');
  return fs.existsSync(latest) ? latest : null;
}

module.exports = {
  generateMembersExcel,
  latestExportPath,
  EXPORT_DIR,
};
