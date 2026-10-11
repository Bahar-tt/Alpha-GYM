import { apiDelete, apiGet, apiPost, apiPut } from './api';

export interface Coach {
  id: number;
  full_name: string;
  phone?: string | null;
  specialty?: string | null;
  commission_percent?: number;
  notes?: string | null;
  is_active?: number;
  created_at?: string;
  has_insurance?: number | boolean | null;
  insurance_notes?: string | null;
  referrer_name?: string | null;
  referral_source?: string | null;
  training_goal?: string | null;
  photo_url?: string | null;
}

export interface CoachForm {
  full_name: string;
  phone: string;
  specialty: string;
  commission_percent: number;
  notes: string;
  is_active: boolean;
  has_insurance: boolean;
  insurance_notes: string;
  referrer_name: string;
  referral_source: string;
  training_goal: string;
  photo_url: string;
}

export interface CoachDetail extends Coach {
  members?: unknown[];
  stats?: {
    member_count: number;
    total_monthly_fee: number;
    total_commission: number;
  };
}

function formToApi(form: CoachForm) {
  return {
    full_name: form.full_name.trim(),
    phone: form.phone.trim() || null,
    specialty: form.specialty.trim() || null,
    commission_percent: form.commission_percent,
    notes: form.notes.trim() || null,
    is_active: form.is_active,
    has_insurance: form.has_insurance ? 1 : 0,
    insurance_notes: form.insurance_notes.trim() || null,
    referrer_name: form.referrer_name.trim() || null,
    referral_source: form.referral_source.trim() || null,
    training_goal: form.training_goal.trim() || null,
    photo_url: form.photo_url.trim() || null,
  };
}

export async function getCoaches() {
  const result = await apiGet<Coach[]>('/coaches');
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: Array.isArray(result.data) ? result.data : [], error: null };
}

export async function getCoach(id: number | string) {
  const result = await apiGet<CoachDetail>(`/coaches/${id}`);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function addCoach(form: CoachForm) {
  const result = await apiPost<Coach>('/coaches', formToApi(form));
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function updateCoach(id: number | string, form: CoachForm) {
  const result = await apiPut<Coach>(`/coaches/${id}`, formToApi(form));
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function deleteCoach(id: number | string) {
  const result = await apiDelete(`/coaches/${id}`);
  return { error: result.error ? { message: result.error } : null };
}
