import { apiDelete, apiGet, apiPatch, apiPost, apiPut, API_BASE } from './api';

export type SessionStatus = 'scheduled' | 'completed' | 'cancelled';
export type SessionType = 'personal' | 'group' | 'assessment';

export interface CoachSession {
  id: number;
  coach_id: number;
  coach_name: string | null;
  member_id: number;
  member_name?: string | null;
  member_phone?: string | null;
  session_date: string;
  session_time: string;
  duration_minutes: number;
  session_type: SessionType;
  status: SessionStatus;
  notes: string | null;
  created_at: string;
}

export interface SessionPayload {
  member_id: number;
  session_date: string;
  session_time: string;
  duration_minutes: number;
  session_type: SessionType;
  notes: string;
}

export async function getCoachSessions() {
  const result = await apiGet<CoachSession[]>('/coach-sessions');
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data ?? [], error: null };
}

export async function createCoachSession(payload: SessionPayload) {
  const result = await apiPost<CoachSession>('/coach-sessions', payload);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function updateCoachSession(
  id: number,
  updates: Partial<{ status: SessionStatus; notes: string; session_date: string; session_time: string; duration_minutes: number; session_type: SessionType }>
) {
  const result = await apiPatch<CoachSession>(`/coach-sessions/${id}`, updates);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function deleteCoachSession(id: number) {
  const result = await apiDelete(`/coach-sessions/${id}`);
  return { error: result.error ? { message: result.error } : null };
}

export const sessionTypeLabels: Record<SessionType, string> = {
  personal: 'شخصی',
  group: 'گروهی',
  assessment: 'ارزیابی',
};

export const sessionStatusLabels: Record<SessionStatus, string> = {
  scheduled: 'برنامه‌ریزی شده',
  completed: 'تکمیل شده',
  cancelled: 'لغو شده',
};

// ─── برنامه‌های تمرینی (workout programs) ───────────────────────────────────

export interface WorkoutProgramItem {
  id: number;
  program_id: number;
  day: string;
  exercise: string;
  sets: number;
  reps: string;
  weight: string | null;
  rest: string | null;
  notes: string | null;
  done: number;
  sort_order: number;
}

export interface WorkoutProgramItemPayload {
  day: string;
  exercise: string;
  sets: number;
  reps: string;
  weight?: string | null;
  rest?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export interface WorkoutProgram {
  id: number;
  member_id: number;
  coach_id: number;
  coach_name: string | null;
  title: string;
  goal: string | null;
  status: 'active' | 'archived';
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: WorkoutProgramItem[];
  member_name?: string | null;
  member_phone?: string | null;
  member_goal?: string | null;
}

export interface WorkoutProgramPayload {
  member_id: number;
  title: string;
  goal?: string | null;
  notes?: string | null;
  items: WorkoutProgramItemPayload[];
}

export async function getCoachPrograms(memberId?: number) {
  const qs = memberId ? `?member_id=${memberId}` : '';
  const result = await apiGet<WorkoutProgram[]>(`/coach-programs${qs}`);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data ?? [], error: null };
}

export async function createCoachProgram(payload: WorkoutProgramPayload) {
  const result = await apiPost<WorkoutProgram>('/coach-programs', payload);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function updateCoachProgram(id: number, payload: Partial<Omit<WorkoutProgramPayload, 'member_id'>>) {
  const result = await apiPut<WorkoutProgram>(`/coach-programs/${id}`, payload);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function toggleProgramItem(id: number, itemId: number, done: boolean) {
  const result = await apiPatch<WorkoutProgram>(`/coach-programs/${id}/items/${itemId}`, { done });
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function deleteCoachProgram(id: number) {
  const result = await apiDelete(`/coach-programs/${id}`);
  return { error: result.error ? { message: result.error } : null };
}

export function coachProgramExportUrl(id: number): string {
  return `${API_BASE}/coach-programs/${id}/export.csv`;
}

// ─── اشتراک پنل مربی (coach plans) ──────────────────────────────────────────

export type CoachPlanType = 'monthly' | 'quarterly' | 'yearly';

export interface CoachPlan {
  id: number;
  coach_staff_id: number;
  coach_name?: string | null;
  coach_username?: string | null;
  plan: CoachPlanType;
  amount: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'cancelled';
  note: string | null;
  settled_by: string | null;
  created_at: string;
}

export interface CoachPlanStatus {
  active: boolean;
  plan?: CoachPlanType;
  start_date?: string;
  end_date?: string;
  amount?: number;
}

export async function getCoachPlans() {
  const result = await apiGet<CoachPlan[]>('/coach-plans');
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data ?? [], error: null };
}

export async function getMyCoachPlan() {
  const result = await apiGet<CoachPlanStatus>('/coach-plans/me');
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function createCoachPlan(payload: { coach_staff_id: number; plan: CoachPlanType; amount: number; months?: number; note?: string }) {
  const result = await apiPost<CoachPlan>('/coach-plans', payload);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function updateCoachPlan(id: number, payload: { status?: 'active' | 'cancelled'; end_date?: string }) {
  const result = await apiPatch<CoachPlan>(`/coach-plans/${id}`, payload);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export const coachPlanLabels: Record<CoachPlanType, string> = {
  monthly: 'ماهانه',
  quarterly: 'سه‌ماهه',
  yearly: 'سالانه',
};
