import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';


import { getMembers, isMemberActive, type MemberRecord } from '../services/memberService';
import { apiGet, type ApiStaffUser } from '../services/api';
import {
  getCoachSessions,
  createCoachSession,
  updateCoachSession,
  sessionTypeLabels,
  getCoachPrograms,
  createCoachProgram,
  updateCoachProgram,
  toggleProgramItem,
  deleteCoachProgram,
  coachProgramExportUrl,
  getMyCoachPlan,
  getCoachPlans,
  createCoachPlan,
  updateCoachPlan,
  coachPlanLabels,
  type CoachSession,
  type SessionStatus,
  type SessionType,
  type WorkoutProgram,
  type WorkoutProgramItemPayload,
  type CoachPlanStatus,
  type CoachPlan,
  type CoachPlanType,
} from '../services/coachPortalService';
import FeatureLockedScreen from '../components/FeatureLockedScreen';
import {
  Dumbbell,
  Calendar,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  X,
  ClipboardList,
  Download,
  Trash2,
  Pencil,
  BadgeCheck,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import { GOAL_KEYS, GOAL_LABELS } from '../lib/goals';

const statusConfig: Record<SessionStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  scheduled: { label: 'برنامه‌ریزی شده', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Clock },
  completed: { label: 'تکمیل شده', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle },
  cancelled: { label: 'لغو شده', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
};

export default function CoachPortal() {
  const { profile, hasFeature } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [myMembers, setMyMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    member_id: '',
    session_date: new Date().toISOString().split('T')[0],
    session_time: '09:00',
    duration_minutes: 60,
    session_type: 'personal' as SessionType,
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<'sessions' | 'members' | 'ftm' | 'programs' | 'plans'>('sessions');
  const [error, setError] = useState('');

  const [programs, setPrograms] = useState<WorkoutProgram[]>([]);
  const [myPlan, setMyPlan] = useState<CoachPlanStatus | null>(null);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [programForm, setProgramForm] = useState({
    member_id: '',
    title: '',
    goal: '',
    notes: '',
  });
  const [programItems, setProgramItems] = useState<WorkoutProgramItemPayload[]>([]);
  const [editingProgram, setEditingProgram] = useState<WorkoutProgram | null>(null);

  const [plans, setPlans] = useState<CoachPlan[]>([]);
  const [coaches, setCoaches] = useState<ApiStaffUser[]>([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({
    coach_staff_id: '',
    plan: 'monthly' as CoachPlanType,
    amount: '',
    months: 1,
    note: '',
  });
  const [submittingPlan, setSubmittingPlan] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const isCoach = profile?.role === 'coach';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: memberList } = await getMembers();
    const active = (memberList || []).filter((m) => isMemberActive(m.end_date));
    setMyMembers(active);

    const { data: sessionList, error: fetchErr } = await getCoachSessions();
    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setError('');
      const list = (sessionList || []).sort((a, b) =>
        `${b.session_date} ${b.session_time}`.localeCompare(`${a.session_date} ${a.session_time}`)
      );
      setSessions(list);
    }

    const { data: programList } = await getCoachPrograms();
    setPrograms(programList || []);

    if (isCoach) {
      const { data: plan } = await getMyCoachPlan();
      setMyPlan(plan);
    }

    if (isAdmin) {
      const { data: planList } = await getCoachPlans();
      setPlans(planList || []);
      const { data: userList } = await apiGet<ApiStaffUser[]>('/users');
      setCoaches((userList || []).filter((u) => u.role === 'coach'));
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.member_id) return;
    setSubmitting(true);
    const { error: createErr } = await createCoachSession({
      member_id: Number(form.member_id),
      session_date: form.session_date,
      session_time: form.session_time,
      duration_minutes: form.duration_minutes,
      session_type: form.session_type,
      notes: form.notes,
    });
    setSubmitting(false);
    if (createErr) {
      setError(createErr.message);
      return;
    }
    setShowModal(false);
    setForm({ ...form, member_id: '' });
    fetchData();
  };

  const updateSessionStatus = async (id: number, status: SessionStatus) => {
    await updateCoachSession(id, { status });
    fetchData();
  };

  const openAddProgram = () => {
    setEditingProgram(null);
    setProgramForm({ member_id: '', title: '', goal: '', notes: '' });
    setProgramItems([emptyProgramItem()]);
    setShowProgramModal(true);
  };

  const openEditProgram = (p: WorkoutProgram) => {
    setEditingProgram(p);
    setProgramForm({
      member_id: String(p.member_id),
      title: p.title,
      goal: p.goal || '',
      notes: p.notes || '',
    });
    setProgramItems(p.items.map((it) => ({
      day: String(it.day ?? '1'),
      exercise: it.exercise,
      sets: it.sets,
      reps: String(it.reps ?? '10'),
      weight: it.weight ?? '',
      rest: it.rest ?? '',
      notes: it.notes ?? '',
    })));
    setShowProgramModal(true);
  };

  const handleProgramSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!programForm.member_id) { setError('انتخاب عضو الزامی است'); return; }
    if (!programForm.title.trim()) { setError('عنوان برنامه الزامی است'); return; }
    const items = programItems.filter((it) => it.exercise.trim());
    if (items.length === 0) { setError('حداقل یک حرکت اضافه کنید'); return; }
    setSubmitting(true);
    const payload = {
      member_id: Number(programForm.member_id),
      title: programForm.title,
      goal: programForm.goal || null,
      notes: programForm.notes,
      items,
    };
    const { error: progErr } = editingProgram
      ? await updateCoachProgram(editingProgram.id, { title: payload.title, goal: payload.goal, notes: payload.notes, items: payload.items })
      : await createCoachProgram(payload);
    setSubmitting(false);
    if (progErr) { setError(progErr.message); return; }
    setError('');
    setShowProgramModal(false);
    fetchData();
  };

  const handleToggleItem = async (programId: number, itemId: number, done: boolean) => {
    await toggleProgramItem(programId, itemId, done);
    fetchData();
  };

  const handleDeleteProgram = async (id: number) => {
    if (!confirm('برنامه تمرینی حذف شود؟')) return;
    const { error: delErr } = await deleteCoachProgram(id);
    if (delErr) { setError(delErr.message); return; }
    fetchData();
  };

  const openPlanModal = () => {
    setPlanForm({ coach_staff_id: '', plan: 'monthly', amount: '', months: 1, note: '' });
    setShowPlanModal(true);
  };

  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planForm.coach_staff_id) { setError('انتخاب مربی الزامی است'); return; }
    setSubmittingPlan(true);
    const { error: planErr } = await createCoachPlan({
      coach_staff_id: Number(planForm.coach_staff_id),
      plan: planForm.plan,
      amount: Number(planForm.amount) || 0,
      months: Number(planForm.months) || 1,
      note: planForm.note,
    });
    setSubmittingPlan(false);
    if (planErr) { setError(planErr.message); return; }
    setError('');
    setShowPlanModal(false);
    setPlanForm({ coach_staff_id: '', plan: 'monthly', amount: '', months: 1, note: '' });
    fetchData();
  };

  const handleCancelPlan = async (id: number) => {
    if (!confirm('اشتراک این مربی لغو شود؟')) return;
    const { error: cancelErr } = await updateCoachPlan(id, { status: 'cancelled' });
    if (cancelErr) { setError(cancelErr.message); return; }
    fetchData();
  };

  const updateProgramItem = (index: number, patch: Partial<WorkoutProgramItemPayload>) => {
    setProgramItems((items) => items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const removeProgramItem = (index: number) => {
    setProgramItems((items) => items.filter((_, i) => i !== index));
  };

  const today = new Date().toISOString().split('T')[0];
  const todaySessions = sessions.filter((s) => s.session_date === today && s.status === 'scheduled');
  const upcomingSessions = sessions.filter(
    (s) => s.session_date > today && s.status === 'scheduled'
  );

  if (!hasFeature('coach_portal')) {
    return (
      <FeatureLockedScreen
        icon={Dumbbell}
        title="پورتال مربی هوشمند"
        description="این بخش با اشتراک ماهانه + هزینه فعال‌سازی در پکیج «مدیریت هوشمند» فعال می‌شود و شامل پنل مربی، مدیریت جلسات، حضور و غیاب و ارتباط مستقیم با اعضا است."
        onBack={() => navigate('/dashboard')}
      />
    );
  }

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

      {error && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">
          {error}
        </div>
      )}

      {isCoach && myPlan?.active && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-400 flex items-center gap-2">
          <BadgeCheck size={16} />
          اشتراک پنل مربی فعال است
          {myPlan.end_date && (
            <span className="text-emerald-400/80">
              — تا {new Date(myPlan.end_date).toLocaleDateString('fa-IR')}
            </span>
          )}
        </div>
      )}

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
      <div className="flex items-center gap-2 flex-wrap">
        {(['sessions', 'members', 'ftm', 'programs'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-4 py-2 text-sm rounded-lg transition-all duration-200 ${
              activeView === view
                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                : 'text-gray-400 hover:text-gray-300 bg-white/5'
            }`}
          >
            {view === 'sessions' ? 'جلسات'
              : view === 'members' ? 'اعضا'
              : view === 'ftm' ? 'ارزیابی ورزشکار'
              : 'برنامه تمرینی'}
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => setActiveView('plans')}
            className={`px-4 py-2 text-sm rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
              activeView === 'plans'
                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                : 'text-gray-400 hover:text-gray-300 bg-white/5'
            }`}
          >
            <Wallet size={14} />
            اشتراک مربی
          </button>
        )}
      </div>

      {isCoach && myPlan && !myPlan.active && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-400 flex items-center gap-2">
          <AlertTriangle size={16} />
          اشتراک پنل مربی شما فعال نیست. برای ثبت جلسه و برنامه تمرینی با باشگاه تماس بگیرید.
        </div>
      )}

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
      ) : activeView === 'ftm' ? (
        /* FTM-7 ارزیابی اولیه ورزشکار */
        <FtmPanel />
      ) : activeView === 'members' ? (
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
                          {m.membership_type || m.membership_type}
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
      ) : activeView === 'plans' ? (
        /* Coach plans view (admin) */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Wallet size={18} className="text-gold-400" />
              اشتراک پنل مربی (حق عضویت)
            </h3>
            <button onClick={openPlanModal} className="btn-gold flex items-center gap-2">
              <Plus size={18} />
              ثبت اشتراک جدید
            </button>
          </div>

          <p className="text-xs text-gray-500">
            با فعال‌سازی اشتراک، دسترسی مربی به پنل و ثبت جلسات/برنامه تمرینی باز می‌شود و مبلغ اشتراک به‌صورت خودکار در حسابداری ثبت می‌شود.
          </p>

          {loading ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : plans.length === 0 ? (
            <div className="glass-card p-10 text-center text-gray-500 text-sm">
              اشتراکی ثبت نشده است
            </div>
          ) : (
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gold-500/10 text-right text-xs text-gray-500">
                      <th className="py-3 px-4 font-medium">مربی</th>
                      <th className="py-3 px-4 font-medium">نوع اشتراک</th>
                      <th className="py-3 px-4 font-medium">مبلغ</th>
                      <th className="py-3 px-4 font-medium">شروع</th>
                      <th className="py-3 px-4 font-medium">پایان</th>
                      <th className="py-3 px-4 font-medium">وضعیت</th>
                      <th className="py-3 px-4 font-medium">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((pl) => (
                      <tr key={pl.id} className="border-b border-white/5 text-white">
                        <td className="py-3 px-4">
                          <span className="text-white">{pl.coach_name || '—'}</span>
                          {pl.note && <span className="text-xs text-gray-600 block mt-0.5">{pl.note}</span>}
                        </td>
                        <td className="py-3 px-4 text-gray-400">{coachPlanLabels[pl.plan] || pl.plan}</td>
                        <td className="py-3 px-4 text-gold-400">
                          {pl.amount ? Number(pl.amount).toLocaleString('fa-IR') : '—'}
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          {new Date(pl.start_date + 'T00:00:00').toLocaleDateString('fa-IR')}
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          {new Date(pl.end_date + 'T00:00:00').toLocaleDateString('fa-IR')}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs px-2 py-1 rounded-full ${pl.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                            {pl.status === 'active' ? 'فعال' : 'لغو شده'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {pl.status === 'active' ? (
                            <button
                              onClick={() => handleCancelPlan(pl.id)}
                              className="text-xs px-2 py-1 rounded-lg bg-white/5 text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                            >
                              لغو اشتراک
                            </button>
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Programs view */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <ClipboardList size={18} className="text-gold-400" />
              برنامه‌های تمرینی
            </h3>
            <button onClick={openAddProgram} className="btn-gold flex items-center gap-2">
              <Plus size={18} />
              برنامه جدید
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : programs.length === 0 ? (
            <div className="glass-card p-10 text-center text-gray-500 text-sm">
              برنامه تمرینی‌ای ثبت نشده است
            </div>
          ) : (
            programs.map((p) => (
              <div key={p.id} className="glass-card p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h4 className="text-base font-semibold text-white">{p.title}</h4>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-gray-500">عضو: {p.member_name || '—'}</span>
                      {p.member_goal && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                          هدف: {GOAL_LABELS[p.member_goal as keyof typeof GOAL_LABELS] || p.member_goal}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gold-500/10 text-gold-400">
                        {p.coach_name || '—'}
                      </span>
                    </div>
                    {p.notes && <p className="text-xs text-gray-500 mt-2">{p.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={coachProgramExportUrl(p.id)}
                      className="p-2 rounded-lg hover:bg-emerald-500/10 text-gray-400 hover:text-emerald-400 transition-colors"
                      title="دانلود CSV"
                    >
                      <Download size={16} />
                    </a>
                    <button
                      onClick={() => openEditProgram(p)}
                      className="p-2 rounded-lg hover:bg-gold-500/10 text-gray-400 hover:text-gold-400 transition-colors"
                      title="ویرایش"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteProgram(p.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                      title="حذف"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gold-500/10 text-right text-xs text-gray-500">
                        <th className="py-2 px-3 font-medium">روز</th>
                        <th className="py-2 px-3 font-medium">حرکت</th>
                        <th className="py-2 px-3 font-medium">ست</th>
                        <th className="py-2 px-3 font-medium">تکرار</th>
                        <th className="py-2 px-3 font-medium">وزنه</th>
                        <th className="py-2 px-3 font-medium">استراحت</th>
                        <th className="py-2 px-3 font-medium">یادداشت</th>
                        <th className="py-2 px-3 font-medium">وضعیت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.items.map((it) => (
                        <tr key={it.id} className="border-b border-white/5 text-white">
                          <td className="py-2 px-3 text-gray-400">روز {it.day}</td>
                          <td className="py-2 px-3">{it.exercise}</td>
                          <td className="py-2 px-3 text-gray-400">{it.sets}</td>
                          <td className="py-2 px-3 text-gray-400">{it.reps}</td>
                          <td className="py-2 px-3 text-gray-400">{it.weight || '—'}</td>
                          <td className="py-2 px-3 text-gray-400">{it.rest || '—'}</td>
                          <td className="py-2 px-3 text-gray-400">{it.notes || '—'}</td>
                          <td className="py-2 px-3">
                            <button
                              onClick={() => handleToggleItem(p.id, it.id, !it.done)}
                              className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 transition-all ${
                                it.done
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-white/5 text-gray-500 hover:text-gold-400'
                              }`}
                            >
                              <CheckCircle size={10} />
                              {it.done ? 'تکمیل' : 'انجام شد؟'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
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
                    onChange={(e) => setForm({ ...form, session_type: e.target.value as SessionType })}
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

      {/* Program Modal */}
      {showProgramModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-2xl p-6 animate-fade-in max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">{editingProgram ? 'ویرایش برنامه تمرینی' : 'برنامه تمرینی جدید'}</h2>
              <button onClick={() => setShowProgramModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleProgramSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">انتخاب عضو</label>
                <select
                  value={programForm.member_id}
                  onChange={(e) => setProgramForm({ ...programForm, member_id: e.target.value })}
                  className="input-dark"
                  required
                  disabled={!!editingProgram}
                >
                  <option value="">انتخاب کنید</option>
                  {myMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">عنوان برنامه</label>
                  <input
                    type="text"
                    value={programForm.title}
                    onChange={(e) => setProgramForm({ ...programForm, title: e.target.value })}
                    className="input-dark"
                    placeholder="مثلاً برنامه بدنسازی ۴ هفته‌ای"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">هدف برنامه</label>
                  <select
                    value={programForm.goal}
                    onChange={(e) => setProgramForm({ ...programForm, goal: e.target.value })}
                    className="input-dark"
                  >
                    <option value="">—</option>
                    {GOAL_KEYS.map((k) => (
                      <option key={k} value={k}>{GOAL_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">یادداشت</label>
                <textarea
                  value={programForm.notes}
                  onChange={(e) => setProgramForm({ ...programForm, notes: e.target.value })}
                  className="input-dark h-20 resize-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm text-gold-400 font-medium">حرکات</label>
                  <button
                    type="button"
                    onClick={() => setProgramItems([...programItems, emptyProgramItem()])}
                    className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1"
                  >
                    <Plus size={14} /> افزودن حرکت
                  </button>
                </div>
                <div className="space-y-3">
                  {programItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-2 sm:grid-cols-7 gap-2 items-end p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="col-span-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">روز</label>
                        <select
                          className="input-dark !py-1.5 text-xs"
                          value={item.day}
                          onChange={(e) => updateProgramItem(idx, { day: e.target.value })}
                        >
                          {['1', '2', '3', '4', '5', '6', '7'].map((d) => (
                            <option key={d} value={d}>روز {d}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-gray-500 mb-1 block">حرکت</label>
                        <input
                          className="input-dark !py-1.5 text-xs"
                          value={item.exercise}
                          onChange={(e) => updateProgramItem(idx, { exercise: e.target.value })}
                          placeholder="نام حرکت"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 mb-1 block">ست</label>
                        <input
                          type="number" min={1}
                          className="input-dark !py-1.5 text-xs"
                          value={item.sets}
                          onChange={(e) => updateProgramItem(idx, { sets: Number(e.target.value) || 1 })}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 mb-1 block">تکرار</label>
                        <input
                          className="input-dark !py-1.5 text-xs"
                          value={item.reps}
                          onChange={(e) => updateProgramItem(idx, { reps: e.target.value })}
                          placeholder="۱۰"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 mb-1 block">وزنه</label>
                        <input
                          className="input-dark !py-1.5 text-xs"
                          value={item.weight ?? ''}
                          onChange={(e) => updateProgramItem(idx, { weight: e.target.value })}
                          placeholder="ک.گ"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">استراحت</label>
                        <input
                          className="input-dark !py-1.5 text-xs"
                          value={item.rest ?? ''}
                          onChange={(e) => updateProgramItem(idx, { rest: e.target.value })}
                          placeholder="۶۰ث"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">یادداشت</label>
                        <input
                          className="input-dark !py-1.5 text-xs"
                          value={item.notes ?? ''}
                          onChange={(e) => updateProgramItem(idx, { notes: e.target.value })}
                          placeholder="اختیاری"
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-7 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeProgramItem(idx)}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                          title="حذف حرکت"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="btn-gold flex-1">
                  {submitting ? 'در حال ذخیره...' : editingProgram ? 'ذخیره تغییرات' : 'ثبت برنامه'}
                </button>
                <button type="button" onClick={() => setShowProgramModal(false)} className="btn-outline-gold">
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Coach Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">ثبت اشتراک پنل مربی</h2>
              <button onClick={() => setShowPlanModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePlanSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">مربی</label>
                <select
                  value={planForm.coach_staff_id}
                  onChange={(e) => setPlanForm({ ...planForm, coach_staff_id: e.target.value })}
                  className="input-dark"
                  required
                >
                  <option value="">انتخاب کنید</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">نوع اشتراک</label>
                  <select
                    value={planForm.plan}
                    onChange={(e) => setPlanForm({ ...planForm, plan: e.target.value as CoachPlanType })}
                    className="input-dark"
                  >
                    <option value="monthly">ماهانه</option>
                    <option value="quarterly">سه‌ماهه</option>
                    <option value="yearly">سالانه</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">تعداد ماه</label>
                  <input
                    type="number" min={1}
                    value={planForm.months}
                    onChange={(e) => setPlanForm({ ...planForm, months: Number(e.target.value) || 1 })}
                    className="input-dark"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">مبلغ (تومان)</label>
                <input
                  type="number" min={0}
                  value={planForm.amount}
                  onChange={(e) => setPlanForm({ ...planForm, amount: e.target.value })}
                  className="input-dark"
                  placeholder="مثلاً ۵۰۰۰۰۰"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">یادداشت</label>
                <input
                  type="text"
                  value={planForm.note}
                  onChange={(e) => setPlanForm({ ...planForm, note: e.target.value })}
                  className="input-dark"
                  placeholder="اختیاری"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submittingPlan} className="btn-gold flex-1">
                  {submittingPlan ? 'در حال ثبت...' : 'ثبت اشتراک'}
                </button>
                <button type="button" onClick={() => setShowPlanModal(false)} className="btn-outline-gold">
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

function emptyProgramItem(): WorkoutProgramItemPayload {
  return { day: '1', exercise: '', sets: 3, reps: '10', weight: '', rest: '', notes: '' };
}

function SessionCard({ session, onUpdate }: { session: CoachSession; onUpdate: (id: number, status: SessionStatus) => void }) {
  const cfg = statusConfig[session.status];
  const CfgIcon = cfg.icon;

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-gold-500/10 hover:border-gold-500/20 transition-all">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold-500/20 to-gold-600/5 flex flex-col items-center justify-center">
          <span className="text-xs text-gold-400 font-bold">
            {new Date(session.session_date + 'T00:00:00').toLocaleDateString('fa-IR', { day: 'numeric' })}
          </span>
          <span className="text-[10px] text-gray-500">
            {new Date(session.session_date + 'T00:00:00').toLocaleDateString('fa-IR', { month: 'short' })}
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-white">{session.member_name || '—'}</p>
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
