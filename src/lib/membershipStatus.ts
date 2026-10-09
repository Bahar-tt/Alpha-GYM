/** وضعیت عضویت بر اساس تاریخ پایان (ISO YYYY-MM-DD) */

export type MembershipStatusKind =
  | 'active'
  | 'expiring_soon' // کمتر از ۷ روز تا پایان (هنوز فعال)
  | 'expired'
  | 'archived';

export interface MembershipStatus {
  kind: MembershipStatusKind;
  label: string;
  /** آیا نیاز به تمدید دارد */
  needsRenewal: boolean;
  daysLeft: number;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T12:00:00');
  const b = new Date(toIso + 'T12:00:00');
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function getMembershipStatus(endDate: string, archived = false): MembershipStatus {
  if (archived) {
    return { kind: 'archived', label: 'بایگانی‌شده', needsRenewal: false, daysLeft: 0 };
  }

  const today = todayIso();
  const daysLeft = daysBetween(today, endDate);

  if (daysLeft < 0) {
    return {
      kind: 'expired',
      label: 'منقضی — نیاز به تمدید',
      needsRenewal: true,
      daysLeft,
    };
  }

  if (daysLeft <= 7) {
    return {
      kind: 'expiring_soon',
      label: daysLeft === 0 ? 'امروز منقضی می‌شود' : `${daysLeft} روز تا انقضا — نیاز به تمدید`,
      needsRenewal: true,
      daysLeft,
    };
  }

  return {
    kind: 'active',
    label: 'فعال',
    needsRenewal: false,
    daysLeft,
  };
}

export const ARCHIVED_KEY = 'alpha_gym_archived_members';
export const RENEWALS_KEY = 'alpha_gym_renewals';
