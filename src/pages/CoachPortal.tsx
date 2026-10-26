import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadJson, saveJson } from '../lib/localStore';
import { getMembers, isMemberActive, type MemberRecord } from '../services/memberService';
import { getCoaches, type Coach } from '../services/coachService';
import {
  jalaliToGregorianIso,
  gregorianToJalali,
  todayJalali,
  formatJalali,
  type JalaliDate,
} from '../lib/jalaliDate';
import JalaliDatePicker from '../components/JalaliDatePicker';
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
  scheduled: { label: 'برنامه‌ریزی شده', color: 'var(--accent)', bg: 'var(--accent-soft)', icon: Clock },
  completed: { label: 'تکمیل شده', color: 'var(--success)', bg: 'var(--success-soft)', icon: CheckCircle },
  cancelled: { label: 'لغو شده', color: 'var(--danger)', bg: 'var(--danger-soft)', icon: XCircle },
};

export default function CoachPortal() {
  const { profile, user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [myMembers, setMyMembers] = useState<MemberRecord[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [sessionDateJalali, setSessionDateJalali] = useState<JalaliDate | null>(todayJalali());
  const [form, setForm] = useState({
    member_id: '',
    session_time: '09:00',
    duration_minutes: 60,
    session_type: 'personal' as 'personal' | 'group' | 'assessment',
    notes: '',
    coach_id: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<'sessions' | 'members'>('sessions');
  const [formError, setFormError] = useState('');

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: memberList }, { data: coachList }] = await Promise.all([
      getMembers(),
      getCoaches(),
    ]);
    const active = (memberList || []).filter((m) => isMemberActive(m.end_date));
    setMyMembers(active);
    setCoaches((coachList || []).filter((c) => c.is_active !== 0));

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

  const openModal = () => {
    setSessionDateJalali(todayJalali());
    setForm({
      member_id: '',
      session_time: '09:00',
      duration_minutes: 60,
      session_type: 'personal',
      notes: '',
      coach_id: coaches[0] ? String(coaches[0].id) : '',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.member_id) {
      setFormError('عضو را انتخاب کنید');
      return;
    }
    if (!sessionDateJalali) {
      setFormError('تاریخ جلسه را از تقویم انتخاب کنید');
      return;
    }

    setSubmitting(true);
    const session: Session = {
      id: String(Date.now()),
      coach_id: form.coach_id || user?.id || '',
      member_id: form.member_id,
      session_date: jalaliToGregorianIso(sessionDateJalali),
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

  const updateSessionStatus = (id: string, status: string) => {
    const list = loadJson<Session[]>(SESSIONS_KEY, []);
    saveJson(
      SESSIONS_KEY,
      list.map((s) => (s.id === id ? { ...s, status: status as Session['status'] } : s)),
    );
    fetchData();
  };

  const today = new Date().toISOString().split('T')[0];
  const todaySessions = sessions.filter((s) => s.session_date === today && s.status === 'scheduled');
  const upcomingSessions = sessions.filter((s) => s.session_date > today && s.status === 'scheduled');

  return (
    <div className="space-y-6">
      <div
        className="page-hero flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Dumbbell size={22} style={{ color: 'var(--accent)' }} />
            {isAdmin ? 'پورتال مربیان' : 'پنل مربی'}
          </h1>
          <p className="page-subtitle">مدیریت جلسات و اعضا</p>
        </div>
        <button type="button" onClick={openModal} className="btn-primary">
          <Plus size={18} />
          ثبت جلسه جدید
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'جلسه امروز', value: todaySessions.length, icon: Calendar },
          { label: 'جلسه آینده', value: upcomingSessions.length, icon: Clock },
          { label: 'اعضای فعال', value: myMembers.length, icon: Users },
          {
            label: 'تکمیل‌شده',
            value: sessions.filter((s) => s.status === 'completed').length,
            icon: CheckCircle,
          },
        ].map((c) => (
          <div key={c.label} className="stat-card">
            <c.icon size={18} style={{ color: 'var(--accent)' }} className="mb-2" />
            <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>
              {c.value.toLocaleString('fa-IR')}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {c.label}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {(['sessions', 'members'] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => setActiveView(view)}
            className="px-4 py-2 text-sm rounded-xl font-medium"
            style={{
              background: activeView === view ? 'var(--accent-soft)' : 'var(--bg-muted)',
              color: activeView === view ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            {view === 'sessions' ? 'جلسات' : 'اعضا'}
          </button>
        ))}
      </div>

      {activeView === 'sessions' ? (
        <div className="space-y-4">
          <div className="panel-card p-5">
            <h3 className="section-title mb-4">جلسات امروز</h3>
            {loading ? (
              <div className="h-8 skeleton" />
            ) : todaySessions.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
                جلسه‌ای برای امروز نیست
              </p>
            ) : (
              <div className="space-y-2">
                {todaySessions.map((s) => (
                  <SessionCard key={s.id} session={s} onUpdate={updateSessionStatus} />
                ))}
              </div>
            )}
          </div>
          <div className="panel-card p-5">
            <h3 className="section-title mb-4">جلسات آینده</h3>
            {upcomingSessions.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
                جلسه آینده‌ای نیست
              </p>
            ) : (
              <div className="space-y-2">
                {upcomingSessions.map((s) => (
                  <SessionCard key={s.id} session={s} onUpdate={updateSessionStatus} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="panel-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ background: 'var(--bg-muted)' }}>
                {['نام', 'تلفن', 'مربی', 'انقضا'].map((h) => (
                  <th key={h} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {myMembers.map((m) => (
                <tr key={m.id} className="table-row">
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text)' }}>
                    {m.full_name}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }} dir="ltr">
                    {m.phone}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {m.coach_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {formatJalali(m.end_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow)',
              maxHeight: '92vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-5 py-4 flex items-center justify-between shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                ثبت جلسه جدید
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              {formError && (
                <div
                  className="p-3 rounded-xl text-sm"
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                >
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  عضو *
                </label>
                <select
                  className="input-field"
                  value={form.member_id}
                  onChange={(e) => setForm({ ...form, member_id: e.target.value })}
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

              {isAdmin && coaches.length > 0 && (
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    مربی
                  </label>
                  <select
                    className="input-field"
                    value={form.coach_id}
                    onChange={(e) => setForm({ ...form, coach_id: e.target.value })}
                  >
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <JalaliDatePicker
                label="تاریخ جلسه"
                value={sessionDateJalali}
                onChange={setSessionDateJalali}
                required
                placeholder="انتخاب از تقویم شمسی"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    ساعت
                  </label>
                  <input
                    type="time"
                    className="input-field"
                    value={form.session_time}
                    onChange={(e) => setForm({ ...form, session_time: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    مدت (دقیقه)
                  </label>
                  <input
                    type="number"
                    min={15}
                    className="input-field"
                    value={form.duration_minutes}
                    onChange={(e) =>
                      setForm({ ...form, duration_minutes: Number(e.target.value) || 60 })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  نوع جلسه
                </label>
                <select
                  className="input-field"
                  value={form.session_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      session_type: e.target.value as Session['session_type'],
                    })
                  }
                >
                  <option value="personal">شخصی</option>
                  <option value="group">گروهی</option>
                  <option value="assessment">ارزیابی</option>
                </select>
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  یادداشت
                </label>
                <textarea
                  className="input-field min-h-[64px]"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>

            <div
              className="px-5 py-4 flex flex-row-reverse gap-2 shrink-0"
              style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}
            >
              <button type="submit" className="btn-primary flex-1" disabled={submitting}>
                {submitting ? '...' : 'ثبت جلسه'}
              </button>
              <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>
                انصراف
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SessionCard({
  session,
  onUpdate,
}: {
  session: Session;
  onUpdate: (id: string, status: string) => void;
}) {
  const cfg = statusConfig[session.status];
  const CfgIcon = cfg.icon;
  return (
    <div
      className="flex items-center justify-between p-3 rounded-xl"
      style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex flex-col items-center justify-center text-xs font-bold"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <span>{formatJalali(session.session_date).split('/')[2]}</span>
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {session.members?.full_name || '—'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {session.session_time} · {session.duration_minutes} دقیقه ·{' '}
            {sessionTypeLabels[session.session_type]}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="text-xs px-2 py-1 rounded-full flex items-center gap-1"
          style={{ background: cfg.bg, color: cfg.color }}
        >
          <CfgIcon size={10} />
          {cfg.label}
        </span>
        {session.status === 'scheduled' && (
          <>
            <button type="button" onClick={() => onUpdate(session.id, 'completed')} style={{ color: 'var(--success)' }}>
              <CheckCircle size={16} />
            </button>
            <button type="button" onClick={() => onUpdate(session.id, 'cancelled')} style={{ color: 'var(--danger)' }}>
              <XCircle size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
