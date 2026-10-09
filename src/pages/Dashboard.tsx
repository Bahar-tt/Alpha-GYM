import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMembers, isMemberActive, type MemberRecord } from '../services/memberService';
import { loadJson } from '../lib/localStore';
import {
  Users,
  UserCheck,
  UserX,
  RefreshCcw,
  TrendingUp,
  AlertTriangle,
  Wallet,
  Calendar,
  Activity,
  ArrowUpRight,
} from 'lucide-react';

interface Stats {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  expiringThisWeek: number;
  totalRenewals: number;
  monthlyRevenue: number;
}

const RENEWALS_KEY = 'alpha_gym_renewals';

interface StoredRenewal {
  amount: number;
  status: string;
  created_at: string;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function weekEndIso(): string {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalMembers: 0,
    activeMembers: 0,
    inactiveMembers: 0,
    expiringThisWeek: 0,
    totalRenewals: 0,
    monthlyRevenue: 0,
  });
  const [recentMembers, setRecentMembers] = useState<MemberRecord[]>([]);
  const [expiringMembers, setExpiringMembers] = useState<MemberRecord[]>([]);
  const [allMembers, setAllMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [isAdmin]);

  const fetchDashboardData = async () => {
    const { data: members, error } = await getMembers();
    if (error) {
      console.error('Dashboard fetchMembers:', error);
      setLoading(false);
      return;
    }

    const list = members || [];
    const today = todayIso();
    const weekEnd = weekEndIso();

    const active = list.filter((m) => isMemberActive(m.end_date));
    const inactive = list.filter((m) => !isMemberActive(m.end_date));
    const expiring = active.filter((m) => m.end_date >= today && m.end_date <= weekEnd);

    const recent = [...list]
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 5);

    let totalRenewals = 0;
    let monthlyRevenue = 0;

    if (isAdmin) {
      const renewals = loadJson<StoredRenewal[]>(RENEWALS_KEY, []);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const monthRenewals = renewals.filter(
        (r) => r.status === 'completed' && r.created_at >= monthAgo,
      );
      totalRenewals = monthRenewals.length;
      monthlyRevenue = monthRenewals.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    }

    setStats({
      totalMembers: list.length,
      activeMembers: active.length,
      inactiveMembers: inactive.length,
      expiringThisWeek: expiring.length,
      totalRenewals,
      monthlyRevenue,
    });
    setRecentMembers(recent);
    setExpiringMembers(expiring.slice(0, 5));
    setAllMembers(list);
    setLoading(false);
  };

  const activeRate = stats.totalMembers
    ? Math.round((stats.activeMembers / stats.totalMembers) * 100)
    : 0;

  const persianDate = new Date().toLocaleDateString('fa-IR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const statCards = [
    {
      label: 'کل اعضا',
      value: stats.totalMembers,
      icon: Users,
      tone: 'accent' as const,
    },
    {
      label: 'اعضای فعال',
      value: stats.activeMembers,
      icon: UserCheck,
      tone: 'success' as const,
    },
    {
      label: 'غیرفعال',
      value: stats.inactiveMembers,
      icon: UserX,
      tone: 'danger' as const,
    },
    {
      label: 'انقضا این هفته',
      value: stats.expiringThisWeek,
      icon: AlertTriangle,
      tone: 'warning' as const,
    },
    ...(isAdmin
      ? [
          {
            label: 'تمدید این ماه',
            value: stats.totalRenewals,
            icon: RefreshCcw,
            tone: 'accent' as const,
          },
          {
            label: 'درآمد ماهانه',
            value: stats.monthlyRevenue.toLocaleString('fa-IR'),
            icon: Wallet,
            tone: 'gold' as const,
            suffix: 'تومان',
          },
        ]
      : []),
  ];

  const toneStyles: Record<string, { bg: string; color: string }> = {
    accent: { bg: 'var(--accent-soft)', color: 'var(--accent)' },
    success: { bg: 'var(--success-soft)', color: 'var(--success)' },
    danger: { bg: 'var(--danger-soft)', color: 'var(--danger)' },
    warning: { bg: 'var(--warning-soft)', color: 'var(--warning)' },
    gold: { bg: 'var(--gold-soft)', color: 'var(--gold)' },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="page-title">داشبورد</h1>
          <p className="page-subtitle flex items-center gap-1.5">
            <Calendar size={14} />
            {persianDate}
          </p>
        </div>
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium"
          style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
        >
          <Activity size={14} style={{ color: 'var(--accent)' }} />
          نرخ فعال بودن: {activeRate}%
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {statCards.map((card, i) => {
          const tone = toneStyles[card.tone];
          return (
            <div
              key={card.label}
              className="stat-card animate-slide-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: tone.bg, color: tone.color }}
                >
                  <card.icon size={18} strokeWidth={2} />
                </div>
                <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
              <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
                {card.value}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {card.label}
                {'suffix' in card && card.suffix ? ` · ${card.suffix}` : ''}
              </p>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        <div className="panel-card p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="section-title">وضعیت اعضا</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                توزیع فعال / غیرفعال / در حال انقضا
              </p>
            </div>
            <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <StatusBarChart
            active={stats.activeMembers}
            inactive={stats.inactiveMembers}
            expiring={stats.expiringThisWeek}
            loading={loading}
          />
        </div>

        <div className="panel-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="section-title">نرخ فعال بودن</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                نسبت اعضای فعال به کل
              </p>
            </div>
          </div>
          <DonutChart value={activeRate} loading={loading} />
        </div>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <MemberListCard
          title="اعضای اخیر"
          icon={<TrendingUp size={16} style={{ color: 'var(--accent)' }} />}
          members={recentMembers}
          loading={loading}
          emptyText="هنوز عضوی ثبت نشده است"
          showStatus
        />
        <MemberListCard
          title="در آستانه انقضا"
          icon={<AlertTriangle size={16} style={{ color: 'var(--warning)' }} />}
          members={expiringMembers}
          loading={loading}
          emptyText="عضوی در آستانه انقضا نیست"
          showDate
        />
      </div>

      {/* Membership distribution */}
      <div className="panel-card p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="section-title">توزیع نوع عضویت</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              بر اساس اعضای فعال
            </p>
          </div>
        </div>
        <MembershipBars members={allMembers} loading={loading} />
      </div>
    </div>
  );
}

function MemberListCard({
  title,
  icon,
  members,
  loading,
  emptyText,
  showStatus,
  showDate,
}: {
  title: string;
  icon: React.ReactNode;
  members: MemberRecord[];
  loading: boolean;
  emptyText: string;
  showStatus?: boolean;
  showDate?: boolean;
}) {
  return (
    <div className="panel-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">{title}</h3>
        {icon}
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 skeleton" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>
          {emptyText}
        </p>
      ) : (
        <div className="space-y-1">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-3 rounded-xl transition-colors"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  {m.full_name?.charAt(0) || '?'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                    {m.full_name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {m.phone}
                  </p>
                </div>
              </div>
              {showStatus && (
                <span className={`badge ${m.is_active ? 'badge-success' : 'badge-danger'}`}>
                  {m.is_active ? 'فعال' : 'غیرفعال'}
                </span>
              )}
              {showDate && (
                <span className="text-xs font-medium" style={{ color: 'var(--warning)' }}>
                  {new Date(m.end_date).toLocaleDateString('fa-IR')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBarChart({
  active,
  inactive,
  expiring,
  loading,
}: {
  active: number;
  inactive: number;
  expiring: number;
  loading: boolean;
}) {
  const max = Math.max(active, inactive, expiring, 1);
  const rows = [
    { label: 'فعال', value: active, color: 'var(--success)' },
    { label: 'غیرفعال', value: inactive, color: 'var(--danger)' },
    { label: 'انقضا نزدیک', value: expiring, color: 'var(--warning)' },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="text-xs w-20 shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {r.label}
          </span>
          <div className="flex-1 h-8 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out flex items-center justify-end px-3"
              style={{
                width: `${Math.max((r.value / max) * 100, r.value ? 8 : 0)}%`,
                background: r.color,
              }}
            >
              {r.value > 0 && (
                <span className="text-[11px] font-bold text-white">{r.value}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ value, loading }: { value: number; loading: boolean }) {
  const size = 160;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;

  if (loading) {
    return <div className="mx-auto skeleton" style={{ width: size, height: size, borderRadius: '50%' }} />;
  }

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bg-muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="-mt-[104px] mb-[48px] text-center pointer-events-none">
        <p className="text-3xl font-extrabold" style={{ color: 'var(--text)' }}>
          {value}%
        </p>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          فعال
        </p>
      </div>
    </div>
  );
}

function MembershipBars({ members, loading }: { members: MemberRecord[]; loading: boolean }) {
  const labels: Record<string, string> = {
    monthly: 'ماهانه',
    quarterly: 'سه‌ماهه',
    yearly: 'سالانه',
    vip: 'VIP',
  };
  const colors = ['var(--accent)', 'var(--success)', 'var(--gold)', '#8b5cf6'];

  const data = useMemo(() => {
    const active = members.filter((m) => isMemberActive(m.end_date));
    const counts: Record<string, number> = {};
    active.forEach((r) => {
      counts[r.membership_type] = (counts[r.membership_type] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  }, [members]);

  const max = Math.max(...data.map((d) => d.count), 1);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 skeleton" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
        داده‌ای برای نمایش نیست
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.type} className="flex items-center gap-3">
          <span className="text-xs w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {labels[d.type] || d.type}
          </span>
          <div className="flex-1 h-7 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(d.count / max) * 100}%`,
                background: colors[i % colors.length],
              }}
            />
          </div>
          <span className="text-sm font-bold w-8 text-left" style={{ color: 'var(--text)' }}>
            {d.count}
          </span>
        </div>
      ))}
    </div>
  );
}
