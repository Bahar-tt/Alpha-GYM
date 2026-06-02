import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadJson, saveJson } from '../lib/localStore';
import { getMembers, isMemberActive, type MemberRecord } from '../services/memberService';
import {
  Dumbbell,
  Calendar,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  X,
} from 'lucide-react';

const SESSIONS_KEY = 'alpha_gym_coach_sessions';

interface Session {
  id: string;
  coach_id: string;
  member_id: string;
  session_date: string;
  session_time: string;
  duration_minutes: number;
  session_type: 'personal' | 'group' | 'assessment';
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string;
  members?: { full_name: string; phone: string };
}

const sessionTypeLabels: Record<string, string> = {
  personal: 'شخصی',
  group: 'گروهی',
  assessment: 'ارزیابی',
};

const statusConfig = {
  scheduled: { label: 'برنامه‌ریزی شده', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Clock },
  completed: { label: 'تکمیل شده', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle },
  cancelled: { label: 'لغو شده', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
};

export default function CoachPortal() {
  const { profile, user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [myMembers, setMyMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    member_id: '',
    session_date: new Date().toISOString().split('T')[0],
    session_time: '09:00',
    duration_minutes: 60,
    session_type: 'personal' as 'personal' | 'group' | 'assessment',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<'sessions' | 'members'>('sessions');

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    const { data: memberList } = await getMembers();
    const active = (memberList || []).filter((m) => isMemberActive(m.end_date));
    setMyMembers(isAdmin ? active : active);

    const stored = loadJson<Session[]>(SESSIONS_KEY, []);
    const byMember = new Map((memberList || []).map((m) => [m.id, m]));
    let list = stored.map((s) => ({
      ...s,
      members: byMember.get(s.member_id)
        ? { full_name: byMember.get(s.member_id)!.full_name, phone: byMember.get(s.member_id)!.phone }
        : undefined,
    }));

    if (!isAdmin && user?.id) {
      list = list.filter((s) => s.coach_id === user.id);
    }

    list.sort((a, b) => a.session_date.localeCompare(b.session_date));
    setSessions(list);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const session: Session = {
      id: String(Date.now()),
      coach_id: user?.id || '',
      member_id: form.member_id,
      session_date: form.session_date,
      session_time: form.session_time,
      duration_minutes: form.duration_minutes,
      session_type: form.session_type,
      status: 'scheduled',
      notes: form.notes,
    };
    const list = loadJson<Session[]>(SESSIONS_KEY, []);
    saveJson(SESSIONS_KEY, [...list, session]);

    setShowModal(false);
    setSubmitting(false);
    fetchData();
  };

  const updateSessionStatus = async (id: string, status: string) => {
    const list = loadJson<Session[]>(SESSIONS_KEY, []);
    saveJson(
      SESSIONS_KEY,
      list.map((s) => (s.id === id ? { ...s, status: status as Session['status'] } : s))
    );
    fetchData();
  };

  const today = new Date().toISOString().split('T')[0];
  const todaySessions = sessions.filter((s) => s.session_date === today && s.status === 'scheduled');
  const upcomingSessions = sessions.filter(
    (s) => s.session_date > today && s.status === 'scheduled'
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Dumbbell size={24} className="text-gold-400" />
            <h1 className="text-2xl font-bold text-white">
              {isAdmin ? 'پورتال مربیان' : 'پنل مربی'}
            </h1>
          </div>
          <p className="text-gray-500 text-sm">
            {isAdmin ? 'مدیریت مربیان و جلسات' : 'مدیریت جلسات و اعضای شما'}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-gold flex items-center gap-2">
          <Plus size={18} />
          ثبت جلسه جدید
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Calendar size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{todaySessions.length}</p>
              <p className="text-xs text-gray-500">جلسه امروز</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gold-500/10 flex items-center justify-center">
              <Clock size={20} className="text-gold-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{upcomingSessions.length}</p>
              <p className="text-xs text-gray-500">جلسه آینده</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Users size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{myMembers.length}</p>
              <p className="text-xs text-gray-500">اعضای شما</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <CheckCircle size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">
                {sessions.filter((s) => s.status === 'completed').length}
              </p>
              <p className="text-xs text-gray-500">جلسه تکمیل شده</p>
            </div>
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2">
        {(['sessions', 'members'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-4 py-2 text-sm rounded-lg transition-all duration-200 ${
              activeView === view
                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                : 'text-gray-400 hover:text-gray-300 bg-white/5'
            }`}
          >
            {view === 'sessions' ? 'جلسات' : 'اعضا'}
          </button>
        ))}
      </div>

      {activeView === 'sessions' ? (
        <div className="space-y-6">
          {/* Today's Sessions */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar size={18} className="text-gold-400" />
              جلسات امروز
            </h3>
            {loading ? (
              <div className="text-center py-8">
                <div className="w-6 h-6 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin mx-auto" />
              </div>
            ) : todaySessions.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">جلسه‌ای برای امروز برنامه‌ریزی نشده</p>
            ) : (
              <div className="space-y-3">
                {todaySessions.map((s) => (
                  <SessionCard key={s.id} session={s} onUpdate={updateSessionStatus} />
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Sessions */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock size={18} className="text-blue-400" />
              جلسات آینده
            </h3>
            {loading ? (
              <div className="text-center py-8">
                <div className="w-6 h-6 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin mx-auto" />
              </div>
            ) : upcomingSessions.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">جلسه آینده‌ای یافت نشد</p>
            ) : (
              <div className="space-y-3">
                {upcomingSessions.map((s) => (
                  <SessionCard key={s.id} session={s} onUpdate={updateSessionStatus} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Members view */
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gold-500/10">
                  {['نام', 'تلفن', 'نوع عضویت', 'تاریخ انقضا', 'وضعیت'].map((h) => (
                    <th key={h} className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {myMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-500">
                      عضویی یافت نشد
                    </td>
                  </tr>
                ) : (
                  myMembers.map((m) => (
                    <tr key={m.id} className="table-row">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-500/30 to-gold-700/10 flex items-center justify-center text-gold-400 text-xs font-bold">
                            {m.full_name.charAt(0)}
                          </div>
                          <span className="text-sm text-white">{m.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{m.phone}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 rounded-full bg-gold-500/10 text-gold-400">
                          {sessionTypeLabels[m.membership_type] || m.membership_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {new Date(m.end_date).toLocaleDateString('fa-IR')}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            m.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {m.is_active ? 'فعال' : 'غیرفعال'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">ثبت جلسه جدید</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">انتخاب عضو</label>
                <select
                  value={form.member_id}
                  onChange={(e) => setForm({ ...form, member_id: e.target.value })}
                  className="input-dark"
                  required
                >
                  <option value="">انتخاب کنید</option>
                  {myMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">تاریخ</label>
                  <input
                    type="date"
                    value={form.session_date}
                    onChange={(e) => setForm({ ...form, session_date: e.target.value })}
                    className="input-dark"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">ساعت</label>
                  <input
                    type="time"
                    value={form.session_time}
                    onChange={(e) => setForm({ ...form, session_time: e.target.value })}
                    className="input-dark"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">نوع جلسه</label>
                  <select
                    value={form.session_type}
                    onChange={(e) => setForm({ ...form, session_type: e.target.value as any })}
                    className="input-dark"
                  >
                    <option value="personal">شخصی</option>
                    <option value="group">گروهی</option>
                    <option value="assessment">ارزیابی</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">مدت (دقیقه)</label>
                  <input
                    type="number"
                    value={form.duration_minutes}
                    onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                    className="input-dark"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">یادداشت</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input-dark h-20 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="btn-gold flex-1">
                  {submitting ? 'در حال ثبت...' : 'ثبت جلسه'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-outline-gold">
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, onUpdate }: { session: Session; onUpdate: (id: string, status: string) => void }) {
  const cfg = statusConfig[session.status];
  const CfgIcon = cfg.icon;

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-gold-500/10 hover:border-gold-500/20 transition-all">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold-500/20 to-gold-600/5 flex flex-col items-center justify-center">
          <span className="text-xs text-gold-400 font-bold">
            {new Date(session.session_date).toLocaleDateString('fa-IR', { day: 'numeric' })}
          </span>
          <span className="text-[10px] text-gray-500">
            {new Date(session.session_date).toLocaleDateString('fa-IR', { month: 'short' })}
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-white">{session.members?.full_name || '—'}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{session.session_time}</span>
            <span className="text-xs text-gray-600">|</span>
            <span className="text-xs text-gray-500">{session.duration_minutes} دقیقه</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gold-500/10 text-gold-400">
              {sessionTypeLabels[session.session_type]}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded-full ${cfg.bg} ${cfg.color} flex items-center gap-1`}>
          <CfgIcon size={10} />
          {cfg.label}
        </span>
        {session.status === 'scheduled' && (
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={() => onUpdate(session.id, 'completed')}
              className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-gray-400 hover:text-emerald-400 transition-colors"
              title="تکمیل"
            >
              <CheckCircle size={16} />
            </button>
            <button
              onClick={() => onUpdate(session.id, 'cancelled')}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
              title="لغو"
            >
              <XCircle size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
