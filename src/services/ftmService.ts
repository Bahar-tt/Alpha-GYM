/**
 * ftmService.ts — فرم ارزیابی اولیه ورزشکار (FTM-7)
 */

import { apiDelete, apiGet, apiPost } from './api';

// ── سطوح ورزشکار ──
export type FtmLevel = 'beginner' | 'semi_pro' | 'pro';
export const FTM_LEVELS: { key: FtmLevel; label: string }[] = [
  { key: 'beginner', label: 'مبتدی' },
  { key: 'semi_pro', label: 'نیمه‌حرفه‌ای' },
  { key: 'pro', label: 'حرفه‌ای' },
];

// ── محل تمرین ──
export type FtmPlace = 'full_gym' | 'limited_gym' | 'home';
export const FTM_PLACES: { key: FtmPlace; label: string }[] = [
  { key: 'full_gym', label: 'باشگاه کامل' },
  { key: 'limited_gym', label: 'باشگاه محدود' },
  { key: 'home', label: 'منزل' },
];

// ── آسیب‌دیدگی ──
export type FtmInjury = 'knee' | 'shoulder' | 'back' | 'ankle' | 'other';
export const FTM_INJURIES: { key: FtmInjury; label: string }[] = [
  { key: 'knee', label: 'زانو' },
  { key: 'shoulder', label: 'شانه' },
  { key: 'back', label: 'کمر' },
  { key: 'ankle', label: 'مچ پا' },
  { key: 'other', label: 'سایر' },
];

// ── اهداف ──
export type FtmGoal =
  | 'strength' | 'vertical_jump' | 'speed_agility' | 'muscle_size'
  | 'fat_loss' | 'injury_prevention' | 'muscular_endurance';
export const FTM_GOALS: { key: FtmGoal; label: string }[] = [
  { key: 'strength', label: 'افزایش قدرت' },
  { key: 'vertical_jump', label: 'افزایش پرش عمودی' },
  { key: 'speed_agility', label: 'افزایش سرعت و چابکی' },
  { key: 'muscle_size', label: 'افزایش حجم عضلانی' },
  { key: 'fat_loss', label: 'کاهش چربی بدن' },
  { key: 'injury_prevention', label: 'پیشگیری از آسیب' },
  { key: 'muscular_endurance', label: 'افزایش استقامت عضلانی' },
];

export interface FtmAssessment {
  id: number;
  member_id: number;
  coach_id: number | null;
  coach_name: string | null;
  // مشخصات فردی
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  // سابقه ورزشی
  bodybuilding_years: number | null;
  last_program_date: string | null;
  days_per_week: number | null;
  // سطح و محل
  level: FtmLevel | null;
  training_place: FtmPlace | null;
  home_equipment: string | null;
  // اهداف و پزشکی
  goals: FtmGoal[];
  injuries: FtmInjury[];
  injury_other: string | null;
  current_pain: string | null;
  doctor_restrictions: string | null;
  // عکس‌ها (بدون صورت)
  photo_back: string | null;
  photo_front: string | null;
  photo_side: string | null;
  // اندازه‌ها
  measured_at: string | null;
  m_weight: number | null;
  m_chest: number | null;
  m_arm: number | null;
  m_waist: number | null;
  m_abdomen: number | null;
  m_glutes: number | null;
  m_thigh: number | null;
  notes: string | null;
  status: 'draft' | 'final' | 'archived';
  created_by: string | null;
  created_at: string;
  // enriched
  member_name?: string | null;
  member_phone?: string | null;
  member_code?: string | null;
}

export interface FtmFormValues {
  member_id: number;
  coach_id?: number | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  bodybuilding_years: number | null;
  last_program_date: string | null;
  days_per_week: number | null;
  level: FtmLevel | null;
  training_place: FtmPlace | null;
  home_equipment: string | null;
  goals: FtmGoal[];
  injuries: FtmInjury[];
  injury_other: string | null;
  current_pain: string | null;
  doctor_restrictions: string | null;
  photo_back: string | null;
  photo_front: string | null;
  photo_side: string | null;
  measured_at: string | null;
  m_weight: number | null;
  m_chest: number | null;
  m_arm: number | null;
  m_waist: number | null;
  m_abdomen: number | null;
  m_glutes: number | null;
  m_thigh: number | null;
  notes: string | null;
  status: 'draft' | 'final';
}

export function emptyFtmForm(memberId: number, coachId?: number | null): FtmFormValues {
  return {
    member_id: memberId,
    coach_id: coachId ?? null,
    age: null, height_cm: null, weight_kg: null,
    bodybuilding_years: null, last_program_date: null, days_per_week: null,
    level: null, training_place: null, home_equipment: null,
    goals: [], injuries: [], injury_other: null,
    current_pain: null, doctor_restrictions: null,
    photo_back: null, photo_front: null, photo_side: null,
    measured_at: null,
    m_weight: null, m_chest: null, m_arm: null, m_waist: null,
    m_abdomen: null, m_glutes: null, m_thigh: null,
    notes: null, status: 'draft',
  };
}

export function assessmentToForm(a: FtmAssessment): FtmFormValues {
  return {
    member_id: a.member_id,
    coach_id: a.coach_id,
    age: a.age, height_cm: a.height_cm, weight_kg: a.weight_kg,
    bodybuilding_years: a.bodybuilding_years,
    last_program_date: a.last_program_date,
    days_per_week: a.days_per_week,
    level: a.level, training_place: a.training_place, home_equipment: a.home_equipment,
    goals: a.goals || [], injuries: a.injuries || [], injury_other: a.injury_other,
    current_pain: a.current_pain, doctor_restrictions: a.doctor_restrictions,
    photo_back: a.photo_back, photo_front: a.photo_front, photo_side: a.photo_side,
    measured_at: a.measured_at,
    m_weight: a.m_weight, m_chest: a.m_chest, m_arm: a.m_arm,
    m_waist: a.m_waist, m_abdomen: a.m_abdomen, m_glutes: a.m_glutes, m_thigh: a.m_thigh,
    notes: a.notes, status: a.status === 'final' ? 'final' : 'draft',
  };
}

/* ── API ── */

export async function getMemberAssessments(memberId: number) {
  return apiGet<{ member: { id: number; name: string; phone: string }; assessments: FtmAssessment[] }>(
    `/ftm/members/${memberId}`,
  );
}

export async function getAssessment(id: number) {
  return apiGet<FtmAssessment>(`/ftm/${id}`);
}

export async function saveAssessment(values: FtmFormValues) {
  return apiPost<FtmAssessment>('/ftm', values);
}

export async function finalizeAssessment(id: number) {
  return apiPost<FtmAssessment>(`/ftm/${id}/finalize`, {});
}

export async function archiveAssessment(id: number) {
  return apiDelete(`/ftm/${id}`);
}

/** برچسب‌های نمایشی */
export const levelLabel = (k: FtmLevel | null) =>
  FTM_LEVELS.find((x) => x.key === k)?.label || '—';
export const placeLabel = (k: FtmPlace | null) =>
  FTM_PLACES.find((x) => x.key === k)?.label || '—';
export const injuryLabel = (k: FtmInjury) =>
  FTM_INJURIES.find((x) => x.key === k)?.label || k;
export const goalLabel = (k: FtmGoal) =>
  FTM_GOALS.find((x) => x.key === k)?.label || k;

export const statusLabels: Record<string, string> = {
  draft: 'پیش‌نویس',
  final: 'نهایی‌شده',
  archived: 'بایگانی',
};

/** کامل بودن فرم (چند درصد پر شده) */
export function completionPercent(f: FtmFormValues): number {
  const checks: [boolean, number][] = [
    [f.age != null, 1],
    [f.height_cm != null, 1],
    [f.weight_kg != null, 1],
    [f.bodybuilding_years != null, 1],
    [f.last_program_date != null, 1],
    [f.days_per_week != null, 1],
    [!!f.level, 1],
    [!!f.training_place, 1],
    [f.training_place !== 'home' || !!f.home_equipment, 1],
    [f.goals.length > 0, 1],
    [f.current_pain != null, 1],
    [f.doctor_restrictions != null, 1],
    [!!f.photo_front, 1],
    [!!f.photo_back, 1],
    [!!f.photo_side, 1],
    [f.m_weight != null, 1],
    [f.m_chest != null, 1],
    [f.m_arm != null, 1],
    [f.m_waist != null, 1],
    [f.m_abdomen != null, 1],
    [f.m_glutes != null, 1],
    [f.m_thigh != null, 1],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return Math.round((done / checks.length) * 100);
}
