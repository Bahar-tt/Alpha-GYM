/**
 * All production API calls use the same-origin /api prefix. Nginx strips the
 * prefix before forwarding to the Node process; Vite rewrites it in dev.
 */
const raw = import.meta.env.VITE_API_URL as string | undefined;
export const API_BASE = (import.meta.env.PROD ? '/api' : raw?.trim() || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'alpha_gym_token';

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage may be unavailable */ }
}

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function handleUnauthorized(res: Response): void {
  if (res.status !== 401) return;
  setToken(null);
  window.dispatchEvent(new CustomEvent('alpha-gym-unauthorized'));
}

export interface ApiMember {
  id: number;
  name: string;
  phone: string;
  expiry_date: string;
  weekly_sessions: number;
  birthday?: string | null;
  personnel_code?: string | null;
  coach_name?: string | null;
  coach_id?: number | null;
  attendance_count?: number;
  membership_type?: string | null;
  start_date?: string | null;
  monthly_fee?: number | null;
  coach_commission_percent?: number | null;
  has_insurance?: number | boolean | null;
  insurance_notes?: string | null;
  referrer_name?: string | null;
  referral_source?: string | null;
  training_goal?: string | null;
  photo_url?: string | null;
  national_id?: string | null;
  father_name?: string | null;
  sport?: string | null;
  sports_json?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  recent_attendances?: unknown[];
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const o = body as { error?: unknown; detail?: unknown; message?: unknown };
    const main = typeof o.error === 'string' ? o.error : typeof o.message === 'string' ? o.message : null;
    const detail = typeof o.detail === 'string' ? o.detail : null;
    if (main && detail) return `${main}: ${detail}`;
    if (main) return main;
    if (detail) return detail;
  }
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...authHeaders(Boolean(init.body)), ...(init.headers || {}) },
    });
    const body = await readBody(res);
    handleUnauthorized(res);
    if (!res.ok) return { data: null, error: errorMessage(body, res.statusText) };
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export function apiGet<T>(path: string) { return request<T>(path); }
export function apiPost<T>(path: string, payload: unknown) {
  return request<T>(path, { method: 'POST', body: JSON.stringify(payload) });
}
export function apiPut<T>(path: string, payload: unknown) {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(payload) });
}
export function apiDelete(path: string) {
  return request<unknown>(path, { method: 'DELETE' }).then(({ error }) => ({ error }));
}
