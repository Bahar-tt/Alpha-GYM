const API_BASE = import.meta.env.VITE_API_URL || '/api';

const TOKEN_KEY = 'alpha_gym_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(json: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export interface ApiMember {
  id: number;
  member_code?: string | null;
  name: string;
  phone: string;
  expiry_date: string;
  start_date?: string | null;
  weekly_sessions: number;
  total_sessions?: number | null;
  used_sessions?: number | null;
  birthday?: string | null;
  national_id?: string | null;
  referrer?: string | null;
  sport?: string | null;
  tuition_amount?: number | null;
  fee_basis?: string | null;
  class_type?: string | null;
  has_insurance?: number | null;
  membership_type?: string | null;
  goal?: string | null;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
  sports?: ApiMemberSport[];
}

export interface ApiStaffUser {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'staff' | 'coach';
  is_active: boolean;
  created_at: string;
  last_login_at?: string | null;
  features?: ApiFeatures;
}

export interface ApiFeatures {
  accounting: boolean;
  attendance: boolean;
  coach_portal: boolean;
  messaging: boolean;
}

export interface ApiAuditLog {
  id: number;
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  member_id: number | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface ApiMemberSport {
  id: number;
  member_id: number;
  sport: string;
  sport_plan_key?: string | null;
  weekly_sessions: number;
  total_sessions: number;
  used_sessions: number;
  tuition_amount?: number | null;
  fee_basis?: string | null;
  class_type?: string | null;
  start_date?: string | null;
  expiry_date: string;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
    return (body as { error: string }).error;
  }
  return fallback;
}

export async function apiGet<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders(false) });
    const body = await readBody(res);
    if (!res.ok) {
      return { data: null, error: errorMessage(body, res.statusText) };
    }
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function apiPost<T>(path: string, payload: unknown): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
    const body = await readBody(res);
    if (!res.ok) {
      return { data: null, error: errorMessage(body, res.statusText) };
    }
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function apiPut<T>(path: string, payload: unknown): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
    const body = await readBody(res);
    if (!res.ok) {
      return { data: null, error: errorMessage(body, res.statusText) };
    }
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function apiDelete(path: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: authHeaders(false) });
    const body = await readBody(res);
    if (!res.ok) {
      return { error: errorMessage(body, res.statusText) };
    }
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function apiPatch<T>(path: string, payload: unknown): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
    const body = await readBody(res);
    if (!res.ok) {
      return { data: null, error: errorMessage(body, res.statusText) };
    }
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export { API_BASE };
