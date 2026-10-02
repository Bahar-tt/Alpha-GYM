import { apiGet, apiPost, apiPatch } from './api';

export type RenewalStatus = 'pending' | 'completed' | 'cancelled';

export interface Renewal {
  id: number;
  member_id: number;
  membership_type: string | null;
  old_end_date: string | null;
  new_end_date: string | null;
  amount: number;
  status: RenewalStatus;
  renewed_by: string | null;
  created_at: string;
  member_name?: string | null;
  member_phone?: string | null;
}

export interface RenewalPayload {
  member_id: number;
  membership_type: string;
  old_end_date?: string;
  new_end_date?: string;
  amount?: number;
  status?: RenewalStatus;
  renewed_by?: string | null;
}

export async function getRenewals() {
  const result = await apiGet<Renewal[]>('/renewals');
  if (result.error) {
    return { data: null, error: { message: result.error } };
  }
  const list = Array.isArray(result.data) ? result.data : [];
  return { data: list, error: null };
}

export async function createRenewal(payload: RenewalPayload) {
  const result = await apiPost<Renewal>('/renewals', payload);
  if (result.error) {
    return { data: null, error: { message: result.error } };
  }
  return { data: result.data, error: null };
}

export async function updateRenewalStatus(id: number, status: RenewalStatus) {
  const result = await apiPatch<Renewal>(`/renewals/${id}/status`, { status });
  if (result.error) {
    return { data: null, error: { message: result.error } };
  }
  return { data: result.data, error: null };
}

export function isCompletedRenewal(r: Renewal): boolean {
  return r.status === 'completed';
}
