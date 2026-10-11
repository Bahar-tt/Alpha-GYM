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
  has_insurance?: boolean;
  insurance_notes?: string;
  referrer_name?: string;
  referral_source?: string;
  training_goal?: string;
  photo_url?: string;
  national_id?: string;
  father_name?: string;
  sport?: string;
  height_cm?: number;
  weight_kg?: number;
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
    has_insurance: !!(row.has_insurance === 1 || row.has_insurance === true),
    insurance_notes: row.insurance_notes ? String(row.insurance_notes) : '',
    referrer_name: row.referrer_name ? String(row.referrer_name) : '',
    referral_source: row.referral_source ? String(row.referral_source) : '',
    training_goal: row.training_goal ? String(row.training_goal) : '',
    photo_url: row.photo_url ? String(row.photo_url) : '',
    national_id: row.national_id ? String(row.national_id) : '',
    father_name: row.father_name ? String(row.father_name) : '',
    sport: row.sport ? String(row.sport) : '',
    height_cm: row.height_cm != null ? Number(row.height_cm) : 0,
    weight_kg: row.weight_kg != null ? Number(row.weight_kg) : 0,
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
    has_insurance: payload.has_insurance ? 1 : 0,
    insurance_notes: payload.insurance_notes?.trim() || null,
    referrer_name: payload.referrer_name?.trim() || null,
    referral_source: payload.referral_source?.trim() || null,
    training_goal: payload.training_goal?.trim() || null,
    photo_url: payload.photo_url?.trim() || null,
    national_id: payload.national_id?.trim() || null,
    father_name: payload.father_name?.trim() || null,
    sport: payload.sport?.trim() || null,
    height_cm: payload.height_cm || null,
    weight_kg: payload.weight_kg || null,
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
  const result = await apiPost<ApiMember & { receipt?: { token: string } }>('/members', payloadToApi(member));
  if (result.error) return { data: null, error: { message: result.error } };
  if (!result.data) return { data: null, error: { message: 'Empty response from server' } };
  return { data: [apiToRecord(result.data)], receipt: (result.data as { receipt?: { token: string } }).receipt, error: null };
}

export async function updateMember(id: string, updates: MemberFormPayload) {
  const result = await apiPut<ApiMember>(`/members/${id}`, payloadToApi(updates));
  if (result.error) return { data: null, error: { message: result.error } };
  if (!result.data) return { data: null, error: { message: 'Empty response from server' } };
  return { data: [apiToRecord(result.data)], error: null };
}

export async function updateMemberExpiry(
  id: string,
  expiryDate: string,
  weeklySessions?: number,
  opts?: { amount?: number; months?: number; membership_type?: string },
) {
  const getOne = await apiGet<ApiMember[]>('/members');
  if (getOne.error || !getOne.data) {
    return { data: null, error: { message: getOne.error || 'Failed to load member' } };
  }
  const existing = getOne.data.find((m) => String(m.id) === id);
  if (!existing) return { data: null, error: { message: 'Member not found' } };
  return apiPut<ApiMember & { receipt?: { token: string } }>(`/members/${id}`, {
    name: existing.name,
    phone: existing.phone,
    expiry_date: expiryDate,
    weekly_sessions: weeklySessions ?? existing.weekly_sessions,
    personnel_code: existing.personnel_code,
    coach_name: existing.coach_name,
    coach_id: existing.coach_id,
    birthday: existing.birthday,
    membership_type: opts?.membership_type || existing.membership_type,
    start_date: existing.start_date,
    monthly_fee: existing.monthly_fee,
    coach_commission_percent: existing.coach_commission_percent,
    has_insurance: existing.has_insurance,
    insurance_notes: existing.insurance_notes,
    referrer_name: existing.referrer_name,
    referral_source: existing.referral_source,
    training_goal: existing.training_goal,
    photo_url: existing.photo_url,
    national_id: existing.national_id,
    father_name: existing.father_name,
    sport: existing.sport,
    height_cm: existing.height_cm,
    weight_kg: existing.weight_kg,
    _renewal: opts
      ? { amount: opts.amount ?? existing.monthly_fee ?? 0, months: opts.months ?? 1 }
      : undefined,
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
