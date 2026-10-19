import { apiGet, apiPost, API_BASE } from './api';

export interface SystemVersion {
  version: string;
  app: string;
  self_update_enabled: boolean;
  node?: string;
  env?: string;
}

export interface UpdateCheck {
  local_version: string;
  remote_version: string | null;
  update_available: boolean;
  self_update_enabled: boolean;
  release_tag?: string | null;
  release_name?: string | null;
  release_url?: string | null;
  release_body?: string | null;
  commit_sha?: string | null;
  commit_message?: string | null;
  commit_date?: string | null;
  commit_url?: string | null;
  owner?: string;
  repo?: string;
  branch?: string;
  note?: string;
}

export interface BackupStats {
  tables: Record<string, number>;
  photo_count: number;
  uploads_dir?: string;
  app_version?: string;
}

export interface BackupPayload {
  format: string;
  format_version: number;
  exported_at: string;
  app_version: string;
  tables: Record<string, number>;
  photo_count: number;
  sql: string;
  photos: Record<string, string>;
  /** client-side localStorage keys (users, renewals, …) */
  local?: Record<string, string>;
}

export interface RestoreResult {
  ok: boolean;
  message: string;
  tables_before?: Record<string, number>;
  tables_after?: Record<string, number>;
  photos_restored?: number;
  photo_errors?: string[];
}

const LOCAL_KEYS = [
  'alpha_gym_session',
  'alpha_gym_users',
  'alpha_gym_renewals',
  'alpha_gym_theme',
];

export async function getSystemVersion() {
  const r = await apiGet<SystemVersion>('/system/version');
  if (r.error) return { data: null, error: { message: r.error } };
  return { data: r.data, error: null };
}

export async function checkUpdates() {
  const r = await apiGet<UpdateCheck>('/system/updates/check');
  if (r.error) return { data: null, error: { message: r.error } };
  return { data: r.data, error: null };
}

export async function applyUpdate() {
  const r = await apiPost<{
    ok: boolean;
    message: string;
    previous_version?: string;
    current_version?: string;
    stdout?: string;
    stderr?: string;
    error?: string;
  }>('/system/updates/apply', {});
  if (r.error) return { data: null, error: { message: r.error } };
  return { data: r.data, error: null };
}

export async function getBackupStats() {
  const r = await apiGet<BackupStats>('/system/backup/stats');
  if (r.error) return { data: null, error: { message: r.error } };
  return { data: r.data, error: null };
}

/** Full backup: SQL + photos + localStorage */
export async function downloadFullBackup() {
  const r = await apiGet<BackupPayload>('/system/backup');
  if (r.error || !r.data) return { data: null, error: { message: r.error || 'empty' } };

  const local: Record<string, string> = {};
  try {
    for (const k of LOCAL_KEYS) {
      const v = localStorage.getItem(k);
      if (v != null) local[k] = v;
    }
  } catch { /* ignore */ }

  const payload: BackupPayload = { ...r.data, local };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `alpha-gym-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return { data: payload, error: null };
}

/** SQL-only download */
export function downloadSqlBackup() {
  const href = `${API_BASE}/system/backup.sql`;
  const a = document.createElement('a');
  a.href = href;
  a.download = `alpha-gym-${new Date().toISOString().slice(0, 10)}.sql`;
  a.click();
}

export async function restoreBackup(payload: BackupPayload | { sql: string; photos?: Record<string, string>; local?: Record<string, string> }) {
  const r = await apiPost<RestoreResult>('/system/restore', {
    format: (payload as BackupPayload).format || 'alpha-gym-backup',
    sql: payload.sql,
    photos: payload.photos || {},
  });
  if (r.error) return { data: null, error: { message: r.error } };

  // restore localStorage if present
  if (payload.local && typeof payload.local === 'object') {
    try {
      for (const [k, v] of Object.entries(payload.local)) {
        if (typeof v === 'string') localStorage.setItem(k, v);
      }
    } catch { /* ignore */ }
  }

  return { data: r.data, error: null };
}
