export type StaffRole = 'admin' | 'staff' | 'coach';

export interface StaffProfile {
  id: string;
  full_name: string;
  phone: string;
  role: StaffRole;
  avatar_url: string;
}

export function normalizeStaffRole(role: string | undefined | null): StaffRole {
  if (role === 'admin' || role === 'staff' || role === 'coach') return role;
  return 'staff';
}

export function isAdminRole(role: string | undefined | null): boolean {
  return normalizeStaffRole(role) === 'admin';
}

export function roleLabel(role: string | undefined | null): string {
  const r = normalizeStaffRole(role);
  if (r === 'admin') return 'مدیر سیستم';
  if (r === 'staff') return 'منشی';
  if (r === 'coach') return 'مربی';
  return 'کاربر';
}
