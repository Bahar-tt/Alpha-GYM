/** رشته‌های ورزشی و شهریه ماهانه ثابت (تومان) */
export const SPORTS = [
  { id: 'bodybuilding', label: 'بدنسازی', monthly_fee: 2500000 },
  { id: 'fitness', label: 'فیتنس عمومی', monthly_fee: 2200000 },
  { id: 'crossfit', label: 'کراس‌فیت', monthly_fee: 2800000 },
  { id: 'yoga', label: 'یوگا', monthly_fee: 2000000 },
  { id: 'pilates', label: 'پیلاتس', monthly_fee: 2100000 },
  { id: 'trx', label: 'TRX', monthly_fee: 2300000 },
  { id: 'functional', label: 'فانکشنال', monthly_fee: 2400000 },
  { id: 'cardio', label: 'هوازی / کاردیو', monthly_fee: 1800000 },
  { id: 'boxing', label: 'بوکس', monthly_fee: 2600000 },
  { id: 'mma', label: 'رزمی / MMA', monthly_fee: 2700000 },
] as const;

export type SportId = (typeof SPORTS)[number]['id'];

export function sportFee(id: string | null | undefined): number {
  const s = SPORTS.find((x) => x.id === id);
  return s ? s.monthly_fee : 0;
}

export function sportLabel(id: string | null | undefined): string {
  const s = SPORTS.find((x) => x.id === id);
  return s ? s.label : id || '—';
}

export const REFERRAL_SOURCES = [
  'اینستاگرام',
  'تلگرام',
  'معرف دوست',
  'گوگل',
  'تبلیغات محیطی',
  'سایت باشگاه',
  'همسایه / رهگذر',
  'سایر',
];

export const TRAINING_GOALS = [
  'کاهش وزن',
  'افزایش حجم عضله',
  'افزایش قدرت',
  'افزایش استقامت',
  'آمادگی مسابقه',
  'سلامت عمومی',
  'اصلاح فرم بدن',
  'توان‌بخشی',
  'کاهش استرس',
];

export const HEIGHT_OPTIONS = Array.from({ length: 71 }, (_, i) => 140 + i); // 140–210
export const WEIGHT_OPTIONS = Array.from({ length: 121 }, (_, i) => 40 + i); // 40–160

/** سن از تاریخ تولد شمسی ذخیره‌شده */
export function calcAgeFromBirthday(birthday: string): number | null {
  if (!birthday) return null;
  const parts = birthday.split(/[/-]/).map(Number);
  if (parts.length < 3 || parts[0] < 1200) return null;
  const [by, bm, bd] = parts;
  const now = new Date();
  // تقریبی: سال شمسی فعلی ≈ میلادی - 621
  const jy = now.getFullYear() - 621;
  const jm = now.getMonth() + 1;
  const jd = now.getDate();
  let age = jy - by;
  if (jm < bm || (jm === bm && jd < bd)) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export function calcBmi(heightCm: number, weightKg: number): number | null {
  if (!heightCm || !weightKg || heightCm < 50) return null;
  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  return Math.round(bmi * 10) / 10;
}

export function bmiLabel(bmi: number | null): string {
  if (bmi == null) return '—';
  if (bmi < 18.5) return `${bmi} (کم‌وزن)`;
  if (bmi < 25) return `${bmi} (طبیعی)`;
  if (bmi < 30) return `${bmi} (اضافه‌وزن)`;
  return `${bmi} (چاقی)`;
}
