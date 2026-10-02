import { apiGet, apiPost, apiPut, apiDelete, getToken, API_BASE } from './api';

export interface ApiPayment {
  id: number;
  member_id: number | null;
  member_name: string | null;
  sport: string | null;
  coach_id: number | null;
  coach_share: number;
  amount: number;
  type: string;
  method: string;
  note: string | null;
  received_by: string | null;
  created_at: string;
}

export interface ApiCoachSport {
  id?: number;
  sport: string;
  commission_percent: number;
  commission_amount: number | null;
}

export interface ApiCoach {
  id: number;
  name: string;
  phone: string | null;
  is_active: number;
  created_at: string;
  sports: ApiCoachSport[];
}

export interface ApiExpense {
  id: number;
  title: string;
  amount: number;
  category: string;
  date: string;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface ApiSummary {
  from: string;
  to: string;
  income_total: number;
  income_today: number;
  expenses_total: number;
  coach_shares_total: number;
  net: number;
  payments_count: number;
  expenses_count: number;
  by_type: { type: string; total: number; count: number }[];
  top_sports: { sport: string; total: number; count: number }[];
}

export interface ApiCoachReportRow {
  id: number;
  name: string;
  phone: string | null;
  sports: { sport: string; commission_percent: number; commission_amount: number | null }[];
  income: number;
  payments_count: number;
  share: number;
  settled: number;
  remaining: number;
  period: string;
}

export interface ApiLedger {
  member: { id: number; name: string; phone: string };
  payments: ApiPayment[];
  renewals: {
    id: number;
    amount: number;
    status: string;
    old_end_date: string | null;
    new_end_date: string | null;
    membership_type: string | null;
    created_at: string;
  }[];
  total_paid: number;
}

export interface ApiPeriod {
  from: string;
  to: string;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthRange(monthsAgo = 0): ApiPeriod {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function getAccountingSummary(period: ApiPeriod) {
  const result = await apiGet<ApiSummary>(`/accounting/summary?from=${period.from}&to=${period.to}`);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function getPayments(period: ApiPeriod, filters: { type?: string; method?: string; sport?: string; q?: string } = {}) {
  const params = new URLSearchParams({ from: period.from, to: period.to });
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const result = await apiGet<{ rows: ApiPayment[]; total: number; count: number }>(`/accounting/payments?${params.toString()}`);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function createPayment(payload: {
  member_id?: number | null;
  member_name?: string;
  amount: number;
  type: string;
  method: string;
  sport?: string;
  note?: string;
  date?: string;
}) {
  const result = await apiPost<ApiPayment>('/accounting/payments', payload);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function deletePayment(id: number) {
  const result = await apiDelete(`/accounting/payments/${id}`);
  return { error: result.error };
}

export async function getCoaches() {
  const result = await apiGet<ApiCoach[]>('/accounting/coaches');
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function createCoach(payload: { name: string; phone?: string; is_active: boolean; sports: ApiCoachSport[] }) {
  const result = await apiPost<ApiCoach>('/accounting/coaches', payload);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function updateCoach(id: number, payload: { name: string; phone?: string; is_active: boolean; sports: ApiCoachSport[] }) {
  const result = await apiPut<ApiCoach>(`/accounting/coaches/${id}`, payload);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function deleteCoach(id: number) {
  const result = await apiDelete(`/accounting/coaches/${id}`);
  return { error: result.error };
}

export async function getCoachReport(period: ApiPeriod) {
  const result = await apiGet<ApiCoachReportRow[]>(`/accounting/coach-report?from=${period.from}&to=${period.to}`);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function settleCoach(id: number, period: string, amount: number, note?: string) {
  const result = await apiPost(`/accounting/coaches/${id}/settle`, { period, amount, note });
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function getExpenses(period: ApiPeriod, category?: string) {
  const params = new URLSearchParams({ from: period.from, to: period.to });
  if (category) params.set('category', category);
  const result = await apiGet<{ rows: ApiExpense[]; total: number; count: number; categories: { category: string; total: number; count: number }[] }>(`/accounting/expenses?${params.toString()}`);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function createExpense(payload: { title: string; amount: number; category: string; date?: string; note?: string }) {
  const result = await apiPost<ApiExpense>('/accounting/expenses', payload);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function updateExpense(id: number, payload: { title: string; amount: number; category: string; date?: string; note?: string }) {
  const result = await apiPut<ApiExpense>(`/accounting/expenses/${id}`, payload);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function deleteExpense(id: number) {
  const result = await apiDelete(`/accounting/expenses/${id}`);
  return { error: result.error };
}

export async function getMemberLedger(id: number) {
  const result = await apiGet<ApiLedger>(`/accounting/member/${id}/ledger`);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

export async function downloadAccountingCsv(path: string, filename: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } });
    if (!res.ok) return 'دانلود فایل انجام نشد';
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return null;
  } catch {
    return 'دانلود فایل انجام نشد';
  }
}

export const paymentTypeLabel: Record<string, string> = {
  registration: 'ثبت‌نام',
  renewal: 'تمدید',
  manual: 'دستی',
  fee: 'شهریه',
  other: 'سایر',
};

export const paymentMethodLabel: Record<string, string> = {
  cash: 'نقدی',
  card: 'کارت',
  transfer: 'کارت‌به‌کارت',
  pos: 'پوز',
  other: 'سایر',
};

export function formatToman(n: number): string {
  return `${(Number(n) || 0).toLocaleString('fa-IR')} ت`;
}
