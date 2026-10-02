import { apiDelete, apiGet, apiPost } from './api';

export type MessageStatus = 'draft' | 'sent';
export type RecipientType = 'all' | 'expiring' | 'individual' | 'coaches';

export interface Message {
  id: number;
  sender_id: number | null;
  sender_name: string | null;
  recipient_type: RecipientType;
  recipient_id: number | null;
  subject: string | null;
  body: string;
  channel: 'sms';
  status: MessageStatus;
  sent_at: string | null;
  created_at: string;
}

export interface SendStats {
  success_count: number;
  failure_count: number;
  total: number;
}

export interface MessagePayload {
  recipient_type: RecipientType;
  recipient_id?: number | null;
  subject: string;
  body: string;
  channel: 'sms';
  status: MessageStatus;
  personalize?: boolean;
}

export async function getMessages() {
  const result = await apiGet<Message[]>('/messages');
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data ?? [], error: null };
}

export async function createMessage(payload: MessagePayload) {
  const result = await apiPost<Message & { stats?: SendStats }>('/messages', payload);
  if (result.error) return { data: null, error: { message: result.error } };
  return { data: result.data, error: null };
}

export async function deleteMessage(id: number) {
  const result = await apiDelete(`/messages/${id}`);
  return { error: result.error ? { message: result.error } : null };
}

export const recipientLabels: Record<RecipientType, string> = {
  all: 'همه اعضا',
  expiring: 'اعضای در حال انقضا',
  individual: 'فردی',
  coaches: 'مربیان',
};
