import { apiDelete, apiGet, apiPost } from './api';

export interface AccountingTotals {
  monthly_revenue: number;
  coach_share: number;
  potential_net: number;
  payments_in: number;
  payments_out: number;
  expenses: number;
  cash_in: number;
  cash_out: number;
  net_balance: number;
  active_members: number;
}

export interface SpecialtyRow {
  specialty: string;
  revenue: number;
  members: number;
  coach_share: number;
}

export interface CoachShareRow {
  coach_id: number | null;
  coach_name: string;
  specialty: string;
  revenue: number;
  members: number;
  commission_percent: number;
  coach_share: number;
}

export interface Payment {
  id: number;
  type: string;
  amount: number;
  direction: 'in' | 'out';
  method?: 'cash' | 'card' | 'transfer' | 'pos' | 'gateway' | 'other' | string;
  member_id?: number | null;
  coach_id?: number | null;
  coach_name?: string | null;
  coach_share_percent?: number;
  coach_share_amount?: number;
  title?: string | null;
  notes?: string | null;
  paid_at: string;
  created_at?: string;
}

export interface Expense {
  id: number;
  category: string;
  title: string;
  amount: number;
  notes?: string | null;
  spent_at: string;
  created_at?: string;
}

export interface LedgerItem {
  id: string;
  kind: 'payment' | 'expense';
  direction: 'in' | 'out';
  amount: number;
  title: string;
  date: string;
}

export interface AccountingAnalytics {
  monthly_trend: { month: string; income: number; payout: number; expense: number; net: number }[];
  payment_mix: { label: string; count: number; amount: number }[];
  expense_mix: { label: string; count: number; amount: number }[];
  actual_net: number;
  profit_margin: number;
}

export interface AccountingSummary {
  totals: AccountingTotals;
  by_specialty: SpecialtyRow[];
  by_coach: CoachShareRow[];
  analytics: AccountingAnalytics;
  payments: Payment[];
  expenses: Expense[];
  ledger: LedgerItem[];
}

export async function getAccountingSummary(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  const result = await apiGet<AccountingSummary>(`/accounting/summary${query ? `?${query}` : ''}`);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function addPayment(payload: {
  type: string;
  amount: number;
  direction: 'in' | 'out';
  member_id?: number | null;
  coach_id?: number | null;
  title?: string;
  notes?: string;
  paid_at?: string;
}) {
  const result = await apiPost<Payment>('/accounting/payments', payload);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function deletePayment(id: number) {
  const result = await apiDelete(`/accounting/payments/${id}`);
  return { error: result.error ? { message: result.error } : null };
}

export async function addExpense(payload: {
  category: string;
  title: string;
  amount: number;
  notes?: string;
  spent_at?: string;
}) {
  const result = await apiPost<Expense>('/accounting/expenses', payload);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function deleteExpense(id: number) {
  const result = await apiDelete(`/accounting/expenses/${id}`);
  return { error: result.error ? { message: result.error } : null };
}
