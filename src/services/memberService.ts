import { apiDelete, apiGet, apiPost, apiPut, type ApiMember } from './api';

export type MembershipType = 'monthly' | 'quarterly' | 'yearly' | 'vip';

export interface MemberFormPayload {
  full_name: string;
  phone: string;
  membership_type: MembershipType;
  weekly_sessions: number;
  total_sessions: number;
  used_sessions: number;
  start_date: string;
  end_date: string;
  birthday: string;
  notes: string;
  personnel_code?: string;
  coach_name?: string;
  coach_id?: number | null;
  monthly_fee?: number;
  coach_commission_percent?: number;
}

export interface MemberRecord extends MemberFormPayload {
  id: string;
  is_active?: boolean;
  created_at?: string;
  attendance_count?: number;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function apiToRecord(row: ApiMember): MemberRecord {
  const active = row.expiry_date >= todayIso();
  const mType = (row.membership_type as MembershipType) || 'monthly';
  return {
    id: String(row.id),
    full_name: row.name,
    phone: row.phone,
    end_date: row.expiry_date,
    start_date: row.start_date || row.expiry_date,
    weekly_sessions: row.weekly_sessions ?? 0,
    membership_type: mType,
    total_sessions: 12,
    used_sessions: 0,
    birthday: row.birthday ? String(row.birthday) : '',
    notes: '',
    personnel_code: row.personnel_code ? String(row.personnel_code) : '',
    coach_name: row.coach_name ? String(row.coach_name) : '',
    coach_id: row.coach_id != null ? Number(row.coach_id) : null,
    monthly_fee: Number(row.monthly_fee) || 0,
    coach_commission_percent: Number(row.coach_commission_percent) || 0,
    attendance_count: row.attendance_count ?? 0,
    is_active: active,
  };
}

function payloadToApi(payload: MemberFormPayload) {
  return {
    name: payload.full_name.trim(),
    phone: payload.phone.trim(),
    expiry_date: payload.end_date,
    weekly_sessions: payload.weekly_sessions,
    birthday: payload.birthday?.trim() || null,
    personnel_code: payload.personnel_code?.trim() || null,
    coach_name: payload.coach_name?.trim() || null,
    coach_id: payload.coach_id ?? null,
    membership_type: payload.membership_type,
    start_date: payload.start_date,
    monthly_fee: payload.monthly_fee ?? 0,
    coach_commission_percent: payload.coach_commission_percent ?? 0,
  };
}

export async function getMembers() {
  const result = await apiGet<ApiMember[]>('/members');
  if (result.error) return { data: null, error: { message: result.error } };
  const list = Array.isArray(result.data) ? result.data : [];
  return { data: list.map(apiToRecord), error: null };
}

export async function getMemberById(id: string) {
  const result = await apiGet<ApiMember>(`/members/${id}`);
  if (result.error) return { data: null, error: { message: result.error } };
  if (!result.data) return { data: null, error: { message: 'Empty response' } };
  return { data: apiToRecord(result.data), raw: result.data, error: null };
}

export async function addMember(member: MemberFormPayload) {
  const result = await apiPost<ApiMember>('/members', payloadToApi(member));
  if (result.error) return { data: null, error: { message: result.error } };
  if (!result.data) return { data: null, error: { message: 'Empty response from server' } };
  return { data: [apiToRecord(result.data)], error: null };
}

export async function updateMember(id: string, updates: MemberFormPayload) {
  const result = await apiPut<ApiMember>(`/members/${id}`, payloadToApi(updates));
  if (result.error) return { data: null, error: { message: result.error } };
  if (!result.data) return { data: null, error: { message: 'Empty response from server' } };
  return { data: [apiToRecord(result.data)], error: null };
}

export async function updateMemberExpiry(id: string, expiryDate: string, weeklySessions?: number) {
  const getOne = await apiGet<ApiMember[]>('/members');
  if (getOne.error || !getOne.data) {
    return { error: { message: getOne.error || 'Failed to load member' } };
  }
  const existing = getOne.data.find((m) => String(m.id) === id);
  if (!existing) return { error: { message: 'Member not found' } };
  return apiPut<ApiMember>(`/members/${id}`, {
    name: existing.name,
    phone: existing.phone,
    expiry_date: expiryDate,
    weekly_sessions: weeklySessions ?? existing.weekly_sessions,
    personnel_code: existing.personnel_code,
    coach_name: existing.coach_name,
    coach_id: existing.coach_id,
    birthday: existing.birthday,
    membership_type: existing.membership_type,
    start_date: existing.start_date,
    monthly_fee: existing.monthly_fee,
    coach_commission_percent: existing.coach_commission_percent,
  });
}

export async function deleteMember(id: string) {
  const result = await apiDelete(`/members/${id}`);
  return { error: result.error ? { message: result.error } : null };
}

export async function recordAttendance(payload: {
  personnel_code?: string;
  member_id?: string;
  source?: string;
}) {
  return apiPost<{ success: boolean; member: ApiMember }>('/attendance', {
    personnel_code: payload.personnel_code,
    member_id: payload.member_id ? Number(payload.member_id) : undefined,
    source: payload.source || 'manual',
  });
}

export function isMemberActive(expiryDate: string): boolean {
  return expiryDate >= todayIso();
}
