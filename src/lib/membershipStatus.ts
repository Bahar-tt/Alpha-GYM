/** وضعیت عضویت بر اساس تاریخ پایان (ISO YYYY-MM-DD) */

export type MembershipStatusKind =
  | 'active'
  | 'expiring_soon'
  | 'expired'
  | 'archived'
  | 'renewed';

export interface MembershipStatus {
  kind: MembershipStatusKind;
  label: string;
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
    return { kind: 'archived', label: 'رد / بایگانی‌شده', needsRenewal: false, daysLeft: 0 };
  }

  const today = todayIso();
  const daysLeft = daysBetween(today, endDate);

  if (daysLeft < 0) {
    return {
      kind: 'expired',
      label: 'غیرفعال — نیاز به تمدید',
      needsRenewal: true,
      daysLeft,
    };
  }

  // ۳ روز یا کمتر: هشدار قرمز
  if (daysLeft <= 3) {
    return {
      kind: 'expiring_soon',
      label:
        daysLeft === 0
          ? 'فعال — امروز منقضی می‌شود'
          : `فعال — ${daysLeft} روز تا انقضا`,
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

/** مدت ماه بر اساس نوع عضویت */
export function monthsForMembershipType(type: string): number {
  switch (type) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'yearly':
      return 12;
    case 'vip':
      return 12;
    default:
      return 1;
  }
}
