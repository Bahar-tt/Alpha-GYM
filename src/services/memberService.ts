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
}

export interface MemberRecord extends MemberFormPayload {
  id: string;
  is_active?: boolean;
  created_at?: string;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function apiToRecord(row: ApiMember): MemberRecord {
  const active = row.expiry_date >= todayIso();
  return {
    id: String(row.id),
    full_name: row.name,
    phone: row.phone,
    end_date: row.expiry_date,
    start_date: row.expiry_date,
    weekly_sessions: row.weekly_sessions ?? 0,
    membership_type: 'monthly',
    total_sessions: 12,
    used_sessions: 0,
    birthday: row.birthday ? String(row.birthday) : '',
    notes: '',
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
  };
}

export async function getMembers() {
  const result = await apiGet<ApiMember[]>('/members');
  if (result.error) {
    return { data: null, error: { message: result.error } };
  }
  const list = Array.isArray(result.data) ? result.data : [];
  return { data: list.map(apiToRecord), error: null };
}

export async function addMember(member: MemberFormPayload) {
  const result = await apiPost<ApiMember>('/members', payloadToApi(member));
  if (result.error) {
    return { data: null, error: { message: result.error } };
  }
  if (!result.data) {
    return { data: null, error: { message: 'Empty response from server' } };
  }
  return { data: [apiToRecord(result.data)], error: null };
}

export async function updateMember(id: string, updates: MemberFormPayload) {
  const result = await apiPut<ApiMember>(`/members/${id}`, payloadToApi(updates));
  if (result.error) {
    return { data: null, error: { message: result.error } };
  }
  if (!result.data) {
    return { data: null, error: { message: 'Empty response from server' } };
  }
  return { data: [apiToRecord(result.data)], error: null };
}

export async function updateMemberExpiry(id: string, expiryDate: string, weeklySessions?: number) {
  const getOne = await apiGet<ApiMember[]>('/members');
  if (getOne.error || !getOne.data) {
    return { error: { message: getOne.error || 'Failed to load member' } };
  }
  const existing = getOne.data.find((m) => String(m.id) === id);
  if (!existing) {
    return { error: { message: 'Member not found' } };
  }
  return apiPut<ApiMember>(`/members/${id}`, {
    name: existing.name,
    phone: existing.phone,
    expiry_date: expiryDate,
    weekly_sessions: weeklySessions ?? existing.weekly_sessions,
  });
}

export async function deleteMember(id: string) {
  const result = await apiDelete(`/members/${id}`);
  return { error: result.error ? { message: result.error } : null };
}

export function isMemberActive(expiryDate: string): boolean {
  return expiryDate >= todayIso();
}
