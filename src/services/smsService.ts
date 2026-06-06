import { apiGet, apiPost } from './api';

export type SmsStatus = 'sent' | 'mock' | 'failed';

export interface SmsLog {
  id: number;
  member_id: number | null;
  name: string;
  phone: string;
  message: string;
  status: SmsStatus;
  created_at: string;
}

export interface SmsLogQuery {
  phone?: string;
  member_id?: number;
}

export interface SmsSendPayload {
  member_id?: number | null;
  name: string;
  phone: string;
  message: string;
}

export interface BroadcastRecipientPayload {
  member_id: number;
  name: string;
  phone: string;
}

export interface BroadcastReport {
  success_count: number;
  failure_count: number;
  total: number;
  details: Array<{
    member_id: number | null;
    phone: string;
    success: boolean;
    error?: string;
  }>;
}

const BROADCAST_DRAFT_KEY = 'alpha_gym_broadcast_draft';

export interface BroadcastDraft {
  message: string;
  audience: string;
  saved_at: string;
}

function buildQuery(params?: SmsLogQuery): string {
  if (!params) return '/sms-logs';
  const q = new URLSearchParams();
  if (params.phone) q.set('phone', params.phone);
  if (params.member_id != null) q.set('member_id', String(params.member_id));
  const qs = q.toString();
  return qs ? `/sms-logs?${qs}` : '/sms-logs';
}

export async function getSmsLogs(params?: SmsLogQuery) {
  const result = await apiGet<SmsLog[]>(buildQuery(params));
  if (result.error) {
    return { data: null, error: { message: result.error } };
  }
  const list = Array.isArray(result.data) ? result.data : [];
  return { data: list, error: null };
}

export async function sendSms(payload: SmsSendPayload) {
  const result = await apiPost<{ success: boolean; log: SmsLog | null }>('/sms/send', payload);
  if (result.error) {
    return { data: null, error: { message: result.error } };
  }
  return { data: result.data, error: null };
}

export async function sendBroadcast(
  recipients: BroadcastRecipientPayload[],
  message: string
): Promise<{ data: BroadcastReport | null; error: { message: string } | null }> {
  const result = await apiPost<BroadcastReport>('/sms/broadcast', {
    recipients,
    message,
  });
  if (result.error) {
    return { data: null, error: { message: result.error } };
  }
  if (!result.data) {
    return { data: null, error: { message: 'Empty response from server' } };
  }
  return { data: result.data, error: null };
}

export function saveBroadcastDraft(draft: Omit<BroadcastDraft, 'saved_at'>) {
  const payload: BroadcastDraft = {
    ...draft,
    saved_at: new Date().toISOString(),
  };
  localStorage.setItem(BROADCAST_DRAFT_KEY, JSON.stringify(payload));
}

export function loadBroadcastDraft(): BroadcastDraft | null {
  try {
    const raw = localStorage.getItem(BROADCAST_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BroadcastDraft;
  } catch {
    return null;
  }
}

export function normalizeSmsStatus(status: string): SmsStatus {
  if (status === 'sent' || status === 'mock' || status === 'failed') return status;
  return 'failed';
}
