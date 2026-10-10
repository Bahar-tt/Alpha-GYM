import { apiGet, apiPost } from './api';

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
