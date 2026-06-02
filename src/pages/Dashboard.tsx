import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMembers, isMemberActive, type MemberRecord } from '../services/memberService';
import { loadJson } from '../lib/localStore';
import WolfLogo from '../components/WolfLogo';
import {
  Users,
  UserCheck,
  UserX,
  RefreshCcw,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Calendar,
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
    const weekEnd = weekEndIso();

    const active = list.filter((m) => isMemberActive(m.end_date));
    const inactive = list.filter((m) => !isMemberActive(m.end_date));
    const expiring = active.filter((m) => m.end_date <= weekEnd);
    const recent = [...list].slice(0, 5);

    let totalRenewals = 0;
    let monthlyRevenue = 0;

    if (isAdmin) {
      const renewals = loadJson<StoredRenewal[]>(RENEWALS_KEY, []);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const monthRenewals = renewals.filter(
        (r) => r.status === 'completed' && r.created_at >= monthAgo
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
    setLoading(false);
  };

  const statCards = [
    {
      label: 'کل اعضا',
      value: stats.totalMembers,
      icon: Users,
      color: 'from-gold-500/20 to-gold-600/5',
      iconColor: 'text-gold-400',
    },
    {
      label: 'اعضای فعال',
      value: stats.activeMembers,
      icon: UserCheck,
      color: 'from-emerald-500/20 to-emerald-600/5',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'اعضای غیرفعال',
      value: stats.inactiveMembers,
      icon: UserX,
      color: 'from-red-500/20 to-red-600/5',
      iconColor: 'text-red-400',
    },
    {
      label: 'منقضی این هفته',
      value: stats.expiringThisWeek,
      icon: AlertTriangle,
      color: 'from-amber-500/20 to-amber-600/5',
      iconColor: 'text-amber-400',
    },
    ...(isAdmin
      ? [
          {
            label: 'تمدید این ماه',
            value: stats.totalRenewals,
            icon: RefreshCcw,
            color: 'from-blue-500/20 to-blue-600/5',
            iconColor: 'text-blue-400',
          },
          {
            label: 'درآمد ماهانه',
            value: `${stats.monthlyRevenue.toLocaleString('fa-IR')} ت`,
            icon: DollarSign,
            color: 'from-gold-500/20 to-gold-600/5',
            iconColor: 'text-gold-400',
          },
        ]
      : []),
  ];

  const persianDate = new Date().toLocaleDateString('fa-IR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <WolfLogo size={36} />
            <h1 className="text-2xl font-bold text-white">داشبورد</h1>
          </div>
          <p className="text-gray-500 text-sm">{persianDate}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Calendar size={16} />
          <span>آخرین بروزرسانی: همین الان</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((card, i) => (
          <div
            key={card.label}
            className="stat-card animate-slide-in"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center mb-3`}>
              <card.icon size={20} className={card.iconColor} />
            </div>
            <p className="text-2xl font-bold text-white">{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">اعضای جدید</h3>
            <TrendingUp size={18} className="text-gold-400" />
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : recentMembers.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">هنوز عضوی ثبت نشده است</p>
          ) : (
            <div className="space-y-2">
              {recentMembers.map((m) => (
                <div key={m.id} className="table-row flex items-center justify-between p-3 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-500/30 to-gold-700/10 flex items-center justify-center text-gold-400 text-sm font-bold">
                      {m.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{m.full_name}</p>
                      <p className="text-xs text-gray-500">{m.phone}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${m.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}
                  >
                    {m.is_active ? 'فعال' : 'غیرفعال'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">اعضای در حال انقضا</h3>
            <AlertTriangle size={18} className="text-amber-400" />
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : expiringMembers.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">اعضای در حال انقضایی یافت نشد</p>
          ) : (
            <div className="space-y-2">
              {expiringMembers.map((m) => (
                <div key={m.id} className="table-row flex items-center justify-between p-3 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-700/10 flex items-center justify-center text-amber-400 text-sm font-bold">
                      {m.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{m.full_name}</p>
                      <p className="text-xs text-gray-500">{m.phone}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-amber-400">{new Date(m.end_date).toLocaleDateString('fa-IR')}</p>
                    <p className="text-xs text-gray-500">{m.membership_type}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">توزیع نوع عضویت</h3>
        <MembershipChart />
      </div>
    </div>
  );
}

function MembershipChart() {
  const [data, setData] = useState<{ type: string; count: number }[]>([]);
  const colors = ['bg-gold-500', 'bg-emerald-500', 'bg-blue-500', 'bg-red-500'];
  const labels: Record<string, string> = {
    monthly: 'ماهانه',
    quarterly: 'سه ماهه',
    yearly: 'سالانه',
    vip: 'VIP',
  };

  useEffect(() => {
    getMembers().then(({ data: rows }) => {
      if (rows) {
        const active = rows.filter((m) => isMemberActive(m.end_date));
        const counts: Record<string, number> = {};
        active.forEach((r) => {
          counts[r.membership_type] = (counts[r.membership_type] || 0) + 1;
        });
        setData(Object.entries(counts).map(([type, count]) => ({ type, count })));
      }
    });
  }, []);

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-4">
      {data.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">داده‌ای موجود نیست</p>
      ) : (
        data.map((d, i) => (
          <div key={d.type} className="flex items-center gap-4">
            <span className="text-sm text-gray-400 w-20">{labels[d.type] || d.type}</span>
            <div className="flex-1 h-8 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full ${colors[i % colors.length]} rounded-full transition-all duration-1000`}
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
            <span className="text-sm font-bold text-white w-8 text-left">{d.count}</span>
          </div>
        ))
      )}
    </div>
  );
}
