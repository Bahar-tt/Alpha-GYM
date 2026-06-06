import type { MemberRecord } from '../services/memberService';
import { isMemberActive } from '../services/memberService';

export type AudienceFilter =
  | 'all'
  | 'active'
  | 'expiring_7'
  | 'expiring_14'
  | 'expired'
  | 'birthdays_today';

export const audienceFilterLabels: Record<AudienceFilter, string> = {
  all: 'همه اعضا',
  active: 'اعضای فعال',
  expiring_7: 'انقضا تا ۷ روز',
  expiring_14: 'انقضا تا ۱۴ روز',
  expired: 'اعضای منقضی',
  birthdays_today: 'تولدهای امروز',
};

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function todayMonthDay(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

function birthdayMonthDay(birthday: string): string | null {
  if (!birthday || !birthday.trim()) return null;
  const trimmed = birthday.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed.slice(5);
  }
  if (/^\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{2}\/\d{2}$/.test(trimmed)) {
    return trimmed.replace('/', '-');
  }
  return null;
}

export function filterMembersByAudience(
  members: MemberRecord[],
  filter: AudienceFilter
): MemberRecord[] {
  const today = todayIso();
  const in7 = addDaysIso(7);
  const in14 = addDaysIso(14);
  const todayMd = todayMonthDay();

  switch (filter) {
    case 'all':
      return members;
    case 'active':
      return members.filter((m) => isMemberActive(m.end_date));
    case 'expiring_7':
      return members.filter(
        (m) => isMemberActive(m.end_date) && m.end_date >= today && m.end_date <= in7
      );
    case 'expiring_14':
      return members.filter(
        (m) => isMemberActive(m.end_date) && m.end_date >= today && m.end_date <= in14
      );
    case 'expired':
      return members.filter((m) => !isMemberActive(m.end_date));
    case 'birthdays_today': {
      return members.filter((m) => {
        const md = birthdayMonthDay(m.birthday);
        return md !== null && md === todayMd;
      });
    }
    default:
      return members;
  }
}

export interface BroadcastRecipient {
  member_id: number;
  name: string;
  phone: string;
}

export function toBroadcastRecipients(members: MemberRecord[]): BroadcastRecipient[] {
  return members
    .filter((m) => m.phone.trim())
    .map((m) => ({
      member_id: Number(m.id),
      name: m.full_name,
      phone: m.phone.trim(),
    }));
}
