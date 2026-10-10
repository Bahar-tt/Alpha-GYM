import { apiGet, apiPost } from './api';

export interface Receipt {
  id: number;
  token: string;
  member_id: number | null;
  member_name: string | null;
  phone: string | null;
  type: string;
  amount: number;
  months: number;
  membership_type: string | null;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

export async function createReceipt(payload: {
  member_id?: number | null;
  member_name?: string;
  phone?: string;
  type: string;
  amount: number;
  months?: number;
  membership_type?: string;
  description?: string;
  period_start?: string;
  period_end?: string;
}) {
  const result = await apiPost<Receipt>('/receipts', payload);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function getReceiptByToken(token: string) {
  const result = await apiGet<Receipt>(`/receipts/token/${token}`);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function getMemberReceipts(memberId: string | number) {
  const result = await apiGet<Receipt[]>(`/receipts/member/${memberId}`);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: Array.isArray(result.data) ? result.data : [], error: null };
}

export function receiptPublicUrl(token: string) {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/receipt/${token}`;
  }
  return `/receipt/${token}`;
}
