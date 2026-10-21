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

/** جمع شهریه ماهانه چند رشته */
export function sumMonthlyFees(sportIds: (string | null | undefined)[]): number {
  return sportIds.reduce((sum, id) => sum + sportFee(id), 0);
}

/**
 * شهریه دوره بر اساس نوع عضویت (ماهانه × تعداد ماه).
 * monthly → ۱، quarterly → ۳، yearly/vip → ۱۲
 */
export function computePeriodFee(
  sportIds: (string | null | undefined)[],
  membershipType: string,
): number {
  const monthly = sumMonthlyFees(sportIds);
  const months =
    membershipType === 'quarterly' ? 3 : membershipType === 'yearly' || membershipType === 'vip' ? 12 : 1;
  return monthly * months;
}

const SPORT_KEYWORDS: Record<string, string[]> = {
  bodybuilding: ['بدنسازی', 'bodybuilding'],
  functional: ['فانکشنال', 'functional'],
  freestyle: ['فری استایل', 'فری‌استایل', 'فیری استایل', 'freestyle'],
  hyrox: ['هایروکس', 'هیروکس', 'hyrox'],
  bodypump: ['بادی پامپ', 'بادی‌پامپ', 'پامپ', 'bodypump'],
  yoga: ['یوگا', 'yoga'],
  pilates: ['پیلاتس', 'pilates'],
  crossfit: ['کراسفیت', 'کراس‌فیت', 'کراس فیت', 'crossfit'],
  aerofitness: ['ایروفیتنس', 'ایرو فیتنس', 'ایرو', 'aerofitness'],
  zumba: ['زومبا', 'zumba'],
  persian_dance: ['رقص ایرانی', 'رقص'],
  crossfit_bb: ['کراسفیت + بدنسازی', 'کراسفیت+بدنسازی'],
  boxing_trx: ['بوکس', 'trx', 'تی‌آر‌ایکس', 'تی ار ایکس', 'boxing'],
};

function scoreCoachForSport(specialty: string, sportId: string): number {
  const spec = (specialty || '').toLowerCase().trim();
  if (!spec) return 0;
  if (spec === sportId.toLowerCase()) return 100;
  const label = sportLabel(sportId).toLowerCase();
  if (spec === label) return 90;
  if (spec.includes(label)) return 70;
  const keys = SPORT_KEYWORDS[sportId] || [label];
  let score = 0;
  for (const k of keys) {
    const kl = k.toLowerCase();
    if (spec === kl) score = Math.max(score, 85);
    else if (spec.includes(kl)) score = Math.max(score, 50 + Math.min(kl.length, 20));
  }
  return score;
}

/** با انتخاب رشته ورزشی، مناسب‌ترین مربی را برمی‌گرداند. */
export function matchCoachForSport(
  sportId: string,
  coaches: { id: number | string; full_name: string; specialty?: string | null }[],
): { id: string; full_name: string } | null {
  if (!sportId || !coaches?.length) return null;
  let best: { id: string; full_name: string; score: number } | null = null;
  for (const c of coaches) {
    const score = scoreCoachForSport(c.specialty || '', sportId);
    if (score > 0 && (!best || score > best.score)) {
      best = { id: String(c.id), full_name: c.full_name, score };
    }
  }
  return best ? { id: best.id, full_name: best.full_name } : null;
}

/** مربی‌ها را برای یک رشته مرتب می‌کند: مرتبط‌ها اول */
export function sortCoachesForSport<
  T extends { id: number | string; full_name: string; specialty?: string | null },
>(sportId: string, coaches: T[]): T[] {
  if (!sportId) return coaches;
  return [...coaches].sort((a, b) => {
    const sa = scoreCoachForSport(a.specialty || '', sportId);
    const sb = scoreCoachForSport(b.specialty || '', sportId);
    return sb - sa;
  });
}

/** با تخصص مربی، مناسب‌ترین رشته ورزشی (id) را پیدا می‌کند. */
export function matchSportForCoach(specialty: string | null | undefined): string {
  if (!specialty) return '';
  const spec = specialty.toLowerCase().trim();
  const byId = SPORTS.find((s) => s.id === specialty || s.id === spec);
  if (byId) return byId.id;
  let bestId = '';
  let bestScore = 0;
  for (const s of SPORTS) {
    const score = scoreCoachForSport(spec, s.id);
    if (score > bestScore) {
      bestScore = score;
      bestId = s.id;
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
