import { toGregorian, toJalaali, jalaaliMonthLength } from 'jalaali-js';

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

export const jalaliMonthNames = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export function todayJalali(): JalaliDate {
  const now = new Date();
  const { jy, jm, jd } = toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { year: jy, month: jm, day: jd };
}

export function gregorianToJalali(isoDate: string): JalaliDate {
  const [y, m, d] = isoDate.split('-').map(Number);
  const { jy, jm, jd } = toJalaali(y, m, d);
  return { year: jy, month: jm, day: jd };
}

export function jalaliToGregorianIso({ year, month, day }: JalaliDate): string {
  const { gy, gm, gd } = toGregorian(year, month, day);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

export function formatJalali(isoDate: string): string {
  const { year, month, day } = gregorianToJalali(isoDate);
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

export function addJalaliMonths(date: JalaliDate, months: number): JalaliDate {
  let year = date.year;
  let month = date.month + months;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  const maxDay = jalaaliMonthLength(year, month);
  return { year, month, day: Math.min(date.day, maxDay) };
}

export function compareJalali(a: JalaliDate, b: JalaliDate): number {
  const aIso = jalaliToGregorianIso(a);
  const bIso = jalaliToGregorianIso(b);
  return aIso.localeCompare(bIso);
}

export function jalaliDaysInMonth(year: number, month: number): number {
  return jalaaliMonthLength(year, month);
}
