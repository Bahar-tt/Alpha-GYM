import { apiDelete, apiGet, apiPost, apiPut, type ApiMember, type ApiMemberSport } from './api';

export type MembershipType = 'monthly' | 'quarterly' | 'yearly' | 'vip';

export type FeeBasis = 'session' | 'monthly';
export type ClassType = 'group' | 'private' | 'personal';

// ✅ پلن شهریه (کاتالوگ — از دیتابیس می‌آید، نه hardcode)
export interface SportPlan {
  id: number;
  sport: string;
  label: string;
  sessions: number;
  price: number;
  class_type: ClassType;
  is_active: number;
  sort_order: number;
  unit_price: number;
  default_share_percent: number;
}

// ✅ گزینه‌های آمادهٔ dropdown در فرم ثبت‌نام
export interface SportPlanOption {
  key: string;
  label: string;
  sport: string;
  plan: { label: string; sessions: number; price: number; class_type: ClassType };
}

/** کاتالوگ پلن‌ها را از سرور می‌گیرد (فقط پلن‌های فعال). */
export async function getSportPlans(sport?: string): Promise<SportPlan[]> {
  const qs = sport ? `?sport=${encodeURIComponent(sport)}` : '';
  const result = await apiGet<SportPlan[]>(`/accounting/sport-plans${qs}`);
  return result.data || [];
}

/** کاتالوگ را به شکل گزینه‌های dropdown درمی‌آورد. */
export function toPlanOptions(plans: SportPlan[]): SportPlanOption[] {
  return plans
    .filter((p) => p.is_active)
    .map((p) => ({
      key: `${p.sport}::${p.sessions}`,
      label: `${p.sport} - ${p.label} (${p.price.toLocaleString('fa-IR')} تومان)`,
      sport: p.sport,
      plan: { label: p.label, sessions: p.sessions, price: p.price, class_type: p.class_type },
    }));
}

// ── مربیان یک رشته ──

export type CoachPayModel = 'share' | 'fixed' | 'hybrid';

export interface SportCoach {
  id: number;
  name: string;
  phone: string | null;
  national_id: string | null;
  pay_model: CoachPayModel;
  default_share: number;
  monthly_salary: number;
  can_private: boolean;
  can_program: boolean;
  is_active: boolean;
  share_percent: number;
  gym_percent: number | null;
  hourly_rate: number | null;
  sport: string;
}

export interface SportCoachesResponse {
  sport: string;
  requested: string;
  coaches: SportCoach[];
  default_coach_id: number | null;
  has_private_coaches: boolean;
}

/**
 * مربیان یک رشته را می‌گیرد تا در فرم ثبت‌نام:
 *  • «گروهی»  → اگر فقط یک مربی باشد خودکار انتخاب می‌شود
 *  • «خصوصی»→ کاربر از بین مربیان مجاز انتخاب می‌کند
 */
export async function getCoachesForSport(sport: string): Promise<SportCoachesResponse | null> {
  if (!sport || !sport.trim()) return null;
  const result = await apiGet<SportCoachesResponse>(
    `/accounting/coaches/by-sport?sport=${encodeURIComponent(sport.trim())}`,
  );
  return result.data || null;
}

// ✅ هر ثبت‌نام ورزشی (اشتراک یک رشته)
export interface SportEnrollment {
  id: string;
  sport: string;
  sport_plan_key: string;
  sport_plan_id: number | null;
  unit_price: number | null;
  weekly_sessions: number;
  total_sessions: number;
  used_sessions: number;
  tuition_amount: number | null;
  fee_basis: FeeBasis;
  class_type: ClassType;
  coach_id: number | null;
  coach_name: string | null;
  start_date: string;
  expiry_date: string;
}

export interface SportEnrollmentPayload {
  sport: string;
  sport_plan_key: string;
  weekly_sessions: number;
  total_sessions: number;
  used_sessions: number;
  tuition_amount: number | null;
  fee_basis: FeeBasis;
  class_type: ClassType;
  coach_id?: number | null;
  start_date: string;
  expiry_date: string;
}

export interface MemberFormPayload {
  full_name: string;
  phone: string;
  member_code?: string | null;
  membership_type: MembershipType;
  birthday: string;
  goal?: string | null;
  notes: string;
  national_id: string;
  referrer: string;
  has_insurance: boolean;
  start_date: string;
  end_date: string;
  // خلاصه (مشتق) برای سازگاری با صفحات قدیمی
  weekly_sessions: number;
  total_sessions: number;
  used_sessions: number;
  sport: string;
  tuition_amount: number | null;
  fee_basis: FeeBasis;
  class_type: ClassType;
  sports: SportEnrollmentPayload[];
}

export interface MemberRecord extends Omit<MemberFormPayload, 'sports'> {
  id: string;
  is_active?: boolean;
  created_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
  sports: SportEnrollment[];
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function apiSportToRecord(s: ApiMemberSport): SportEnrollment {
  const total = s.total_sessions ?? 0;
  const tuition = s.tuition_amount ?? null;
  // اگر سرور unit_price نداد، از قیمت و تعداد جلسات مشتق کن
  const unit = s.unit_price != null
    ? s.unit_price
    : (tuition != null && tuition > 0 && total > 0 ? Math.round(tuition / total) : null);
  return {
    id: String(s.id),
    sport: s.sport || '',
    sport_plan_key: s.sport_plan_key || '',
    sport_plan_id: s.sport_plan_id ?? null,
    unit_price: unit,
    weekly_sessions: s.weekly_sessions ?? 0,
    total_sessions: total,
    used_sessions: s.used_sessions ?? 0,
    tuition_amount: tuition,
    fee_basis: (s.fee_basis === 'session' ? 'session' : 'monthly'),
    class_type: (s.class_type === 'private' ? 'private' : s.class_type === 'personal' ? 'personal' : 'group'),
    coach_id: s.coach_id ?? null,
    coach_name: s.coach_name ?? null,
    start_date: s.start_date || '',
    expiry_date: s.expiry_date || '',
  };
}

function apiToRecord(row: ApiMember): MemberRecord {
  const active = row.expiry_date >= todayIso();
  const sports = (row.sports || []).map(apiSportToRecord);
  const fallbackSport = sports.length > 0 ? sports[0] : null;
  return {
    id: String(row.id),
    full_name: row.name,
    phone: row.phone,
    member_code: row.member_code ? String(row.member_code) : null,
    end_date: row.expiry_date,
    start_date: row.start_date ?? row.expiry_date,
    weekly_sessions: fallbackSport?.weekly_sessions ?? row.weekly_sessions ?? 0,
    membership_type: (row.membership_type as MembershipType) || 'monthly',
    total_sessions: fallbackSport?.total_sessions ?? row.total_sessions ?? 0,
    used_sessions: fallbackSport?.used_sessions ?? row.used_sessions ?? 0,
    birthday: row.birthday ? String(row.birthday) : '',
    goal: row.goal ?? null,
    notes: row.notes ?? '',
    national_id: row.national_id ?? '',
    referrer: row.referrer ?? '',
    sport: (sports.map((s) => s.sport).filter(Boolean).join(' + ')) || (row.sport ?? ''),
    tuition_amount: fallbackSport?.tuition_amount ?? row.tuition_amount ?? null,
    fee_basis: fallbackSport?.fee_basis ?? 'monthly',
    class_type: fallbackSport?.class_type ?? 'group',
    has_insurance: !!row.has_insurance,
    is_active: active,
    created_by: row.created_by ?? null,
    updated_by: row.updated_by ?? null,
    updated_at: row.updated_at ?? null,
    sports,
  };
}

function payloadToApi(payload: MemberFormPayload) {
  return {
    name: payload.full_name.trim(),
    phone: payload.phone.trim(),
    member_code: payload.member_code?.trim() ? payload.member_code.trim() : undefined,
    birthday: payload.birthday?.trim() || null,
    national_id: payload.national_id?.trim() || null,
    referrer: payload.referrer?.trim() || null,
    has_insurance: payload.has_insurance ? 1 : 0,
    notes: payload.notes?.trim() || null,
    membership_type: payload.membership_type,
    goal: payload.goal?.trim() || null,
    start_date: payload.start_date,
    sports: payload.sports.map((s) => ({
      sport: s.sport.trim(),
      sport_plan_key: s.sport_plan_key || null,
      weekly_sessions: s.weekly_sessions,
      total_sessions: s.total_sessions,
      used_sessions: s.used_sessions,
      tuition_amount: s.tuition_amount != null ? Number(s.tuition_amount) : null,
      fee_basis: s.fee_basis,
      class_type: s.class_type,
      start_date: s.start_date,
      expiry_date: s.expiry_date,
    })),
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

// ✅ تمدید سریع (سازگاری): همه‌ی رشته‌های عضو به تاریخ جدید تمدید می‌شوند
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
