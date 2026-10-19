/** رشته‌های ورزشی باشگاه (متناسب با مربیان واقعی) + شهریه ماهانه (تومان) */
export const SPORTS = [
  { id: 'bodybuilding', label: 'بدنسازی', monthly_fee: 2500000 },
  { id: 'functional', label: 'فانکشنال فیتنس', monthly_fee: 2200000 },
  { id: 'freestyle', label: 'فری استایل', monthly_fee: 2200000 },
  { id: 'hyrox', label: 'هایروکس', monthly_fee: 2300000 },
  { id: 'bodypump', label: 'بادی پامپ', monthly_fee: 2000000 },
  { id: 'yoga', label: 'یوگا', monthly_fee: 1800000 },
  { id: 'pilates', label: 'پیلاتس', monthly_fee: 1800000 },
  { id: 'crossfit', label: 'کراسفیت', monthly_fee: 2400000 },
  { id: 'aerofitness', label: 'ایروفیتنس', monthly_fee: 2000000 },
  { id: 'zumba', label: 'زومبا', monthly_fee: 1700000 },
  { id: 'persian_dance', label: 'رقص ایرانی', monthly_fee: 1700000 },
  { id: 'crossfit_bb', label: 'کراسفیت + بدنسازی', monthly_fee: 2500000 },
  { id: 'boxing_trx', label: 'بوکس + TRX', monthly_fee: 2300000 },
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

const SPORT_KEYWORDS: Record<string, string[]> = {
  bodybuilding: ['بدنسازی'],
  functional: ['فانکشنال'],
  freestyle: ['فری استایل', 'فری‌استایل', 'فیری استایل'],
  hyrox: ['هایروکس', 'هیروکس'],
  bodypump: ['بادی پامپ', 'بادی‌پامپ', 'پامپ'],
  yoga: ['یوگا'],
  pilates: ['پیلاتس'],
  crossfit: ['کراسفیت', 'کراس‌فیت', 'کراس فیت'],
  aerofitness: ['ایروفیتنس', 'ایرو فیتنس', 'ایرو'],
  zumba: ['زومبا'],
  persian_dance: ['رقص ایرانی', 'رقص'],
  crossfit_bb: ['کراسفیت + بدنسازی'],
  boxing_trx: ['بوکس', 'trx', 'تی‌آر‌ایکس', 'تی ار ایکس'],
};

/**
 * با انتخاب رشته ورزشی، مناسب‌ترین مربی را برمی‌گرداند.
 */
export function matchCoachForSport(
  sportId: string,
  coaches: { id: number | string; full_name: string; specialty?: string | null }[],
): { id: string; full_name: string } | null {
  if (!sportId || !coaches?.length) return null;
  const keys = SPORT_KEYWORDS[sportId] || [sportLabel(sportId)];
  let best: { id: string; full_name: string; score: number } | null = null;
  for (const c of coaches) {
    const spec = (c.specialty || '').toLowerCase();
    if (!spec) continue;
    let score = 0;
    for (const k of keys) {
      if (spec.includes(k.toLowerCase())) score += k.length + 5;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: String(c.id), full_name: c.full_name, score };
    }
  }
  return best ? { id: best.id, full_name: best.full_name } : null;
}

/**
 * با تخصص مربی، مناسب‌ترین رشته ورزشی (id) را پیدا می‌کند.
 */
export function matchSportForCoach(specialty: string | null | undefined): string {
  if (!specialty) return '';
  const spec = specialty.toLowerCase();
  let bestId = '';
  let bestScore = 0;
  for (const [id, keys] of Object.entries(SPORT_KEYWORDS)) {
    let score = 0;
    for (const k of keys) {
      if (spec.includes(k.toLowerCase())) score += k.length + 5;
    }
    const label = sportLabel(id).toLowerCase();
    if (spec === label || spec.includes(label)) score += 20;
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestId;
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

export const HEIGHT_OPTIONS = Array.from({ length: 71 }, (_, i) => 140 + i);
export const WEIGHT_OPTIONS = Array.from({ length: 121 }, (_, i) => 40 + i);

export function calcAgeFromBirthday(birthday: string): number | null {
  if (!birthday) return null;
  const parts = birthday.split(/[/-]/).map(Number);
  if (parts.length < 3 || parts[0] < 1200) return null;
  const [by, bm, bd] = parts;
  const now = new Date();
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
