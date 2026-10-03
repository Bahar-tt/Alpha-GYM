/**
 * coachEarningsService.ts — سرویس سمت کاربر موتور سهم مربی
 *
 * پوشش فاز ۶ تا ۱۱:
 *  ۶) تقسیم جلسه بین چند مربی
 *  ۷) کسورات و پاداش
 *  ۸) تسویه (پیش‌نمایش، ثبت، لغو، گروهی)
 *  ۹) گزارش‌ها (سودآوری مربی/رشته، پیش‌بینی، تطبیق پلن)
 * ۱۱) خروجی CSV
 */

import { apiDelete, apiGet, apiPost, apiPut } from './api';

// ── انواع پایه ──

export type CoachPayModel = 'share' | 'fixed' | 'hybrid';
export type AdjustmentKind = 'deduction' | 'bonus';

export interface CoachRow {
  id: number;
  name: string;
  phone: string | null;
  national_id?: string | null;
  pay_model: CoachPayModel;
  monthly_salary: number;
  default_share: number;
  can_private: boolean;
  can_program: boolean;
  is_active: boolean;
}

/** فاز ۹ — سطر داشبورد سودآوری */
export interface ProfitabilityRow {
  id: number;
  name: string;
  phone: string | null;
  pay_model: CoachPayModel;
  monthly_salary: number;
  can_private: boolean;
  can_program: boolean;
  sports: string[];
  // سهم مربی (بدهی باشگاه)
  session_total: number;
  salary_total: number;
  gross: number;
  deductions: number;
  bonuses: number;
  net: number;
  settled: number;
  remaining: number;
  // درآمد و سهم باشگاه
  sessions: number;
  revenue: number;
  gym_share: number;
  gym_margin: number;
}

export interface EarningsRow {
  id: number;
  coach_id: number;
  member_id: number | null;
  member_name: string | null;
  sport: string | null;
  session_id: number | null;
  source_type: 'session' | 'salary' | 'bonus' | 'manual';
  source_id: number | null;
  period: string;
  earned_at: string;
  unit_price: number;
  share_percent: number;
  share_basis: string;
  gross: number;
  net: number;
  note: string | null;
  settlement_id: number | null;
}

export interface EarningsSummary {
  coach_id: number;
  from: string;
  to: string;
  session_total: number;
  salary_total: number;
  bonus_total: number;
  adjustments_bonus: number;
  deductions: number;
  items: number;
  gross: number;
  net: number;
  settled: number;
  remaining: number;
}

export interface Adjustment {
  id: number;
  coach_id: number;
  period: string;
  kind: AdjustmentKind;
  amount: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Settlement {
  id: number;
  coach_id: number;
  coach_name?: string;
  coach_phone?: string | null;
  period: string;
  period_start: string | null;
  period_end: string | null;
  amount: number;
  gross: number;
  deductions: number;
  net: number;
  item_count: number;
  note: string | null;
  settled_by: string | null;
  created_at: string;
}

export interface SettlementDetail {
  settlement: Settlement;
  coach: { id: number; name: string; phone: string | null };
  items: EarningsRow[];
  adjustments: Adjustment[];
}

export interface SettlePreview {
  coach: { id: number; name: string; pay_model: CoachPayModel; monthly_salary: number };
  period: string;
  items: EarningsRow[];
  item_count: number;
  salary_pending: number;
  gross: number;
  bonuses: number;
  deductions: number;
  net: number;
}

export interface CoachEarningsDetail {
  coach: CoachRow;
  from: string;
  to: string;
  summary: EarningsSummary;
  earnings: EarningsRow[];
  settlements: Settlement[];
  adjustments: Adjustment[];
}

export interface SportProfitability {
  sport: string;
  sessions: number;
  revenue: number;
  coach_share: number;
  gym_share: number;
  coach_paid: number;
  net_profit: number;
}

export interface Forecast {
  coach: { id: number; name: string };
  period: string;
  days_passed: number;
  days_in_month: number;
  session_total: number;
  per_day: number;
  projected_sessions: number;
  projected_total: number;
}

export interface PlanUtilization {
  sport_id: number;
  sport: string;
  coach_id: number | null;
  coach_name: string | null;
  class_type: string;
  total_sessions: number;
  used_sessions: number;
  remaining_sessions: number;
  tuition_amount: number;
  unit_price: number;
  used_value: number;
  remaining_value: number;
  earned_sessions: number;
  is_expired: boolean;
}

export interface SessionSplit {
  id?: number;
  coach_id: number;
  share_percent: number;
  name: string;
  phone?: string | null;
  coach_share_percent?: number | null;
}

/* ── فاز ۶: تقسیم جلسه ── */

export async function getSessionSplits(sessionId: number) {
  return apiGet<{ session_id: number; splits: SessionSplit[] }>(
    `/accounting/coach-sessions/${sessionId}/splits`,
  );
}

export async function setSessionSplits(sessionId: number, splits: { coach_id: number; share_percent: number }[]) {
  return apiPut<{ ok: boolean; splits: SessionSplit[]; earnings?: unknown }>(
    `/accounting/coach-sessions/${sessionId}/splits`,
    { splits },
  );
}

/* ── فاز ۷: کسورات و پاداش ── */

export async function getAdjustments(coachId: number, period?: string) {
  const qs = period ? `?period=${encodeURIComponent(period)}` : '';
  return apiGet<{ coach: { id: number; name: string }; adjustments: Adjustment[] }>(
    `/accounting/coaches/${coachId}/adjustments${qs}`,
  );
}

export async function addAdjustment(
  coachId: number,
  payload: { period: string; kind: AdjustmentKind; amount: number; reason?: string },
) {
  return apiPost<{ ok: boolean; id: number; adjustment: Adjustment }>(
    `/accounting/coaches/${coachId}/adjustments`,
    payload,
  );
}

export async function deleteAdjustment(id: number) {
  return apiDelete(`/accounting/adjustments/${id}`);
}

/* ── فاز ۸: تسویه ── */

export async function getSettlePreview(coachId: number, period: string) {
  return apiGet<SettlePreview>(
    `/accounting/coaches/${coachId}/settle-preview?period=${encodeURIComponent(period)}`,
  );
}

export async function settleCoach(
  coachId: number,
  payload: { period: string; includeAdjustments?: boolean; note?: string },
) {
  return apiPost<{ ok: boolean; settlement_id: number; items: number; net: number }>(
    `/accounting/coaches/${coachId}/settle`,
    payload,
  );
}

export async function settleAllCoaches(payload: { period: string; coach_ids?: number[]; note?: string }) {
  return apiPost<{
    period: string;
    settled_count: number;
    skipped_count: number;
    total_net: number;
    results: { coach_id: number; ok: boolean; error?: string; net?: number }[];
  }>('/accounting/coaches/settle-all', payload);
}

export async function getSettlements(params?: { coach_id?: number; period?: string }) {
  const q = new URLSearchParams();
  if (params?.coach_id) q.set('coach_id', String(params.coach_id));
  if (params?.period) q.set('period', params.period);
  const qs = q.toString();
  return apiGet<Settlement[]>(`/accounting/settlements${qs ? `?${qs}` : ''}`);
}

export async function getSettlement(id: number) {
  return apiGet<SettlementDetail>(`/accounting/settlements/${id}`);
}

export async function cancelSettlement(id: number) {
  return apiDelete(`/accounting/settlements/${id}`);
}

/* ── فاز ۹: گزارش‌ها ── */

export async function getCoachProfitability(from: string, to: string) {
  return apiGet<ProfitabilityRow[]>(
    `/accounting/coach-earnings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export async function getSportProfitability(from: string, to: string) {
  return apiGet<SportProfitability[]>(
    `/accounting/sport-profitability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export async function getForecast(coachId: number, period?: string) {
  const qs = period ? `?period=${encodeURIComponent(period)}` : '';
  return apiGet<Forecast>(`/accounting/coaches/${coachId}/forecast${qs}`);
}

export async function getCoachEarningsDetail(
  coachId: number,
  from: string,
  to: string,
  opts?: { onlyUnsettled?: boolean },
) {
  const q = new URLSearchParams({ from, to });
  if (opts?.onlyUnsettled) q.set('settled', 'false');
  return apiGet<CoachEarningsDetail>(`/accounting/coach-earnings/${coachId}?${q.toString()}`);
}

export async function getPlanUtilization(memberId: number) {
  return apiGet<{ member: { id: number; name: string }; plans: PlanUtilization[] }>(
    `/accounting/members/${memberId}/plan-utilization`,
  );
}

export async function rebuildEarnings(sessionId?: number) {
  return apiPost<{ ok: boolean; processed?: number; earned?: number; skipped?: number }>(
    '/accounting/coach-earnings/rebuild',
    { session_id: sessionId },
  );
}

/* ── کمکی ── */

const faNum = new Intl.NumberFormat('fa-IR');
export const fmt = (n: number | null | undefined) => faNum.format(Number(n) || 0);
export const fmtPct = (n: number | null | undefined) => `${faNum.format(Number(n) || 0)}٪`;

export const payModelLabels: Record<CoachPayModel, string> = {
  share: 'درصدی از جلسات',
  fixed: 'حقوق ثابت',
  hybrid: 'درصدی + حقوق ثابت',
};

export const adjustmentLabels: Record<AdjustmentKind, string> = {
  deduction: 'کسورات',
  bonus: 'پاداش',
};

export const sourceTypeLabels: Record<string, string> = {
  session: 'جلسه',
  salary: 'حقوق ثابت',
  bonus: 'پاداش',
  manual: 'دستی',
};

/** رنگ وضعیت تسویه برای نمایش */
export function settlementStatus(remaining: number): { label: string; color: string } {
  if (remaining <= 0) return { label: 'تسویه‌شده', color: 'text-emerald-400' };
  if (remaining < 1000000) return { label: 'در انتظار', color: 'text-amber-400' };
  return { label: 'عقب‌افتاده', color: 'text-red-400' };
}
