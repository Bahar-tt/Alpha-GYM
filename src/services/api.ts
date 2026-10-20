/**
 * API base URL:
 * - Production (Docker): empty → same origin (works on ANY domain: runflare, custom, http/https)
 * - Local dev: set VITE_API_URL=http://localhost:8000
 */
const raw = import.meta.env.VITE_API_URL as string | undefined;
const API_BASE =
  typeof raw === 'string' && raw.trim().length > 0
    ? raw.trim().replace(/\/$/, '')
    : ''; // relative → works with every host/domain

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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const o = body as { error?: unknown; detail?: unknown; message?: unknown };
    const main =
      typeof o.error === 'string'
        ? o.error
        : typeof o.message === 'string'
          ? o.message
          : null;
    const detail = typeof o.detail === 'string' ? o.detail : null;
    if (main && detail) return `${main}: ${detail}`;
    if (main) return main;
    if (detail) return detail;
  }
  return fallback;
}

export async function apiGet<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    const body = await readBody(res);
    if (!res.ok) return { data: null, error: errorMessage(body, res.statusText) };
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function apiPost<T>(path: string, payload: unknown): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await readBody(res);
    if (!res.ok) return { data: null, error: errorMessage(body, res.statusText) };
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function apiPut<T>(path: string, payload: unknown): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await readBody(res);
    if (!res.ok) return { data: null, error: errorMessage(body, res.statusText) };
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function apiDelete(path: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
    const body = await readBody(res);
    if (!res.ok) return { error: errorMessage(body, res.statusText) };
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}

export { API_BASE };
