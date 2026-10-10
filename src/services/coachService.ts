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
}

export interface CoachForm {
  full_name: string;
  phone: string;
  specialty: string;
  commission_percent: number;
  notes: string;
  is_active: boolean;
}

export interface CoachDetail extends Coach {
  members?: unknown[];
  stats?: {
    member_count: number;
    total_monthly_fee: number;
    total_commission: number;
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
  const result = await apiPost<Coach>('/coaches', {
    full_name: form.full_name.trim(),
    phone: form.phone.trim() || null,
    specialty: form.specialty.trim() || null,
    commission_percent: form.commission_percent,
    notes: form.notes.trim() || null,
    is_active: form.is_active,
  });
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function updateCoach(id: number | string, form: CoachForm) {
  const result = await apiPut<Coach>(`/coaches/${id}`, {
    full_name: form.full_name.trim(),
    phone: form.phone.trim() || null,
    specialty: form.specialty.trim() || null,
    commission_percent: form.commission_percent,
    notes: form.notes.trim() || null,
    is_active: form.is_active,
  });
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function deleteCoach(id: number | string) {
  const result = await apiDelete(`/coaches/${id}`);
  return { error: result.error ? { message: result.error } : null };
}
