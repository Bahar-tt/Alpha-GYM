import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';


import {
  getAccountingSummary,
  getPayments,
  createPayment,
  deletePayment,
  getCoaches,
  createCoach,
  updateCoach,
  deleteCoach,
  getCoachReport,
  settleCoach,
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getMemberLedger,
  downloadAccountingCsv,
  monthRange,
  todayIso,
  formatToman,
  paymentTypeLabel,
  paymentMethodLabel,
  type ApiPayment,
  type ApiCoach,
  type ApiCoachSport,
  type ApiExpense,
  type ApiSummary,
  type ApiCoachReportRow,
  type ApiLedger,
  type ApiPeriod,
} from '../services/accountingService';
import { getMembers, type MemberRecord } from '../services/memberService';
import {
  LayoutDashboard,
  BarChart3,
  Users2,
  Wallet,
  Receipt,
  History,
  Plus,
  Trash2,
  Download,
  Pencil,
  Banknote,
  Search,
  X,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import FeatureLockedScreen from '../components/FeatureLockedScreen';
import CoachEarningsPanel from '../components/CoachEarningsPanel';

type TabKey = 'dashboard' | 'income' | 'coaches' | 'coachEngine' | 'payments' | 'expenses' | 'ledger';

const tabs: { key: TabKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard',   label: 'داشبورد مالی',  icon: LayoutDashboard },
  { key: 'income',      label: 'درآمد رشته‌ها',  icon: BarChart3 },
  { key: 'coaches',     label: 'فهرست مربیان',  icon: Users2 },
  { key: 'coachEngine', label: 'موتور سهم مربی', icon: TrendingUp },
  { key: 'payments',    label: 'پرداخت‌ها',      icon: Wallet },
  { key: 'expenses',    label: 'هزینه‌ها',       icon: Receipt },
  { key: 'ledger',      label: 'گردش حساب',      icon: History },
];

export default function Accounting() {
  const { hasFeature } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [period, setPeriod] = useState<ApiPeriod>(() => monthRange(0));
  const [backendLocked, setBackendLocked] = useState(false);
  const [checking, setChecking] = useState(true);

  const locked = backendLocked || !hasFeature('accounting');

  useEffect(() => {
    let active = true;
    getAccountingSummary(monthRange(0))
      .then((r) => {
        if (active) {
          setBackendLocked(r.error === 'FEATURE_LOCKED');
          setChecking(false);
        }
      })
      .catch(() => active && setChecking(false));
    return () => { active = false; };
  }, []);

  if (checking) {
    return <div className="space-y-6 animate-fade-in"><h1 className="text-2xl font-bold text-white">حسابداری</h1><div className="glass-card p-8 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}</div></div>;
  }

  if (locked) {
    return <LockedScreen onBack={() => navigate('/dashboard')} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Wallet className="text-gold-400" size={26} />
            حسابداری باشگاه
          </h1>
          <p className="text-gray-500 text-sm mt-1">گزارش مالی، درآمد رشته‌ها، سهم مربی و هزینه‌ها</p>
        </div>
        <PeriodPicker period={period} onChange={setPeriod} />
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border ${
              tab === t.key
                ? 'bg-gold-500/15 border-gold-500/40 text-gold-400'
                : 'border-gold-500/10 text-gray-400 hover:text-gold-400 hover:border-gold-500/30'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardTab period={period} />}
      {tab === 'income' && <IncomeTab period={period} />}
      {tab === 'coaches' && <CoachesTab period={period} />}
      {tab === 'coachEngine' && <CoachEarningsPanel period={period} />}
      {tab === 'payments' && <PaymentsTab period={period} />}
      {tab === 'expenses' && <ExpensesTab period={period} />}
      {tab === 'ledger' && <LedgerTab />}
    </div>
  );
}

/* ────────────────────────── Period ────────────────────────── */

function PeriodPicker({ period, onChange }: { period: ApiPeriod; onChange: (p: ApiPeriod) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onChange(monthRange(0))}
        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${period.from === monthRange(0).from ? 'bg-gold-500/15 border-gold-500/40 text-gold-400' : 'border-gold-500/10 text-gray-400 hover:text-gold-400'}`}
      >
        این ماه
      </button>
      <button
        onClick={() => onChange(monthRange(1))}
        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${period.from === monthRange(1).from ? 'bg-gold-500/15 border-gold-500/40 text-gold-400' : 'border-gold-500/10 text-gray-400 hover:text-gold-400'}`}
      >
        ماه قبل
      </button>
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={period.from}
          max={period.to}
          onChange={(e) => e.target.value && onChange({ ...period, from: e.target.value })}
          className="input-dark !w-auto !py-2 text-xs"
        />
        <span className="text-gray-500 text-xs">تا</span>
        <input
          type="date"
          value={period.to}
          min={period.from}
          onChange={(e) => e.target.value && onChange({ ...period, to: e.target.value })}
          className="input-dark !w-auto !py-2 text-xs"
        />
      </div>
    </div>
  );
}

/* ────────────────────────── Dashboard ────────────────────────── */

function DashboardTab({ period }: { period: ApiPeriod }) {
  const [summary, setSummary] = useState<ApiSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getAccountingSummary(period).then((r) => {
      if (!active) return;
      if (r.data) setSummary(r.data);
      setLoading(false);
    });
    return () => { active = false; };
  }, [period]);

  if (loading) return <div className="glass-card p-8 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}</div>;

  if (!summary) return null;

  const cards = [
    { label: 'درآمد دوره', value: formatToman(summary.income_total), icon: TrendingUp, color: 'from-emerald-500/20 to-emerald-600/5', iconColor: 'text-emerald-400' },
    { label: 'درآمد امروز', value: formatToman(summary.income_today), icon: Banknote, color: 'from-gold-500/20 to-gold-600/5', iconColor: 'text-gold-400' },
    { label: 'سهم مربی‌ها', value: formatToman(summary.coach_shares_total), icon: Users2, color: 'from-blue-500/20 to-blue-600/5', iconColor: 'text-blue-400' },
    { label: 'هزینه‌ها', value: formatToman(summary.expenses_total), icon: TrendingDown, color: 'from-red-500/20 to-red-600/5', iconColor: 'text-red-400' },
    { label: 'سود خالص', value: formatToman(summary.net), icon: PiggyBank, color: 'from-purple-500/20 to-purple-600/5', iconColor: 'text-purple-400' },
    { label: 'تعداد پرداخت', value: summary.payments_count.toLocaleString('fa-IR'), icon: Receipt, color: 'from-amber-500/20 to-amber-600/5', iconColor: 'text-amber-400' },
  ];

  const maxSport = Math.max(...summary.top_sports.map((s) => s.total), 1);
  const colors = ['bg-gold-500', 'bg-emerald-500', 'bg-blue-500', 'bg-red-500', 'bg-amber-500', 'bg-purple-500'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((c, i) => (
          <div key={c.label} className="stat-card" style={{ animationDelay: `${i * 60}ms` }}>
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${c.color} flex items-center justify-center mb-3`}>
              <c.icon size={20} className={c.iconColor} />
            </div>
            <p className="text-xl font-bold text-white">{c.value}</p>
            <p className="text-xs text-gray-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">درآمد به تفکیک رشته</h3>
          {summary.top_sports.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">در این بازه پرداختی ثبت نشده است</p>
          ) : (
            <div className="space-y-4">
              {summary.top_sports.map((s, i) => (
                <div key={s.sport} className="flex items-center gap-4">
                  <span className="text-sm text-gray-400 w-32 truncate">{s.sport}</span>
                  <div className="flex-1 h-8 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full ${colors[i % colors.length]} rounded-full transition-all duration-1000`} style={{ width: `${(s.total / maxSport) * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold text-white text-left w-24">{formatToman(s.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">جزئیات درآمد</h3>
          {summary.by_type.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">داده‌ای موجود نیست</p>
          ) : (
            <div className="space-y-3">
              {summary.by_type.map((t) => (
                <div key={t.type} className="flex items-center justify-between p-3 rounded-xl border border-gold-500/10 bg-white/5">
                  <div>
                    <p className="text-sm font-medium text-white">{paymentTypeLabel[t.type] || t.type}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.count.toLocaleString('fa-IR')} پرداخت</p>
                  </div>
                  <p className="text-sm font-bold gold-text-gradient">{formatToman(t.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── Income ────────────────────────── */

function IncomeTab({ period }: { period: ApiPeriod }) {
  const [summary, setSummary] = useState<ApiSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getAccountingSummary(period).then((r) => { if (!active) return; setSummary(r.data); setLoading(false); });
    return () => { active = false; };
  }, [period]);

  const exportCsv = async () => {
    await downloadAccountingCsv(`/accounting/export/payments.csv?from=${period.from}&to=${period.to}`, `incomes_${period.from}_${period.to}.csv`);
  };

  const rows = summary?.top_sports || [];
  const totalIncome = summary?.income_total || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-400">
          مجموع درآمد دوره: <span className="text-gold-400 font-bold">{formatToman(totalIncome)}</span>
        </p>
        <button onClick={exportCsv} className="btn-outline-gold !px-4 !py-2 text-sm flex items-center gap-2">
          <Download size={16} /> خروجی اکسل/CSV
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-12">در این بازه پرداختی ثبت نشده است</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold-500/10 text-right">
                <th className="p-4 text-xs text-gray-400">رشته</th>
                <th className="p-4 text-xs text-gray-400">تعداد پرداخت</th>
                <th className="p-4 text-xs text-gray-400">درآمد</th>
                <th className="p-4 text-xs text-gray-400">سهم</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.sport} className="table-row">
                  <td className="p-4 text-sm text-white font-medium">{s.sport}</td>
                  <td className="p-4 text-sm text-gray-300">{s.count.toLocaleString('fa-IR')}</td>
                  <td className="p-4 text-sm text-gold-400 font-bold">{formatToman(s.total)}</td>
                  <td className="p-4 text-sm text-gray-300">
                    {totalIncome > 0 ? `${Math.round((s.total / totalIncome) * 100).toLocaleString('fa-IR')}٪` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────── Coaches ────────────────────────── */

interface CoachForm {
  id: number | null;
  name: string;
  phone: string;
  is_active: boolean;
  sports: { sport: string; commission_percent: string; commission_amount: string }[];
}

const emptyCoachForm: CoachForm = { id: null, name: '', phone: '', is_active: true, sports: [] };

function CoachesTab({ period }: { period: ApiPeriod }) {
  const [coaches, setCoaches] = useState<ApiCoach[]>([]);
  const [report, setReport] = useState<ApiCoachReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CoachForm>(emptyCoachForm);
  const [error, setError] = useState<string | null>(null);
  const [settleTarget, setSettleTarget] = useState<ApiCoachReportRow | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNote, setSettleNote] = useState('');

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([getCoaches(), getCoachReport(period)]);
    if (c.data) setCoaches(c.data);
    if (r.data) setReport(r.data);
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm(emptyCoachForm);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: ApiCoach) => {
    setForm({
      id: c.id,
      name: c.name,
      phone: c.phone || '',
      is_active: !!c.is_active,
      sports: c.sports.map((s) => ({ sport: s.sport, commission_percent: String(s.commission_percent ?? 0), commission_amount: s.commission_amount != null ? String(s.commission_amount) : '' })),
    });
    setError(null);
    setModalOpen(true);
  };

  const submitCoach = async () => {
    if (!form.name.trim()) { setError('نام مربی الزامی است'); return; }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      is_active: form.is_active,
      sports: form.sports.filter((s) => s.sport.trim()).map((s): ApiCoachSport => ({
        sport: s.sport.trim(),
        commission_percent: Number(s.commission_percent) || 0,
        commission_amount: s.commission_amount !== '' ? Number(s.commission_amount) : null,
      })),
    };
    const res = form.id ? await updateCoach(form.id, payload) : await createCoach(payload);
    if (res.error) { setError(res.error); return; }
    setModalOpen(false);
    await load();
  };

  const removeCoach = async (c: ApiCoach) => {
    if (!confirm(`مربی «${c.name}» غیرفعال شود؟`)) return;
    const res = await deleteCoach(c.id);
    if (res.error) { setError(res.error); return; }
    await load();
  };

  const doSettle = async () => {
    if (!settleTarget) return;
    const amt = Number(settleAmount);
    if (!amt || amt <= 0) { setError('مبلغ تسویه را وارد کنید'); return; }
    const res = await settleCoach(settleTarget.id, settleTarget.period, amt, settleNote.trim() || undefined);
    if (res.error) { setError(res.error); return; }
    setSettleTarget(null);
    setSettleAmount('');
    setSettleNote('');
    await load();
  };

  if (loading) return <div className="glass-card p-8 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-400">مدیریت مربی‌ها و محاسبه سهم آن‌ها از پرداخت‌ها</p>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => await downloadAccountingCsv(`/accounting/export/coach-report.csv?from=${period.from}&to=${period.to}`, `coach_report_${period.from}_${period.to}.csv`)}
            className="btn-outline-gold !px-4 !py-2 text-sm flex items-center gap-2"
          >
            <Download size={16} /> خروجی اکسل/CSV
          </button>
          <button onClick={openAdd} className="btn-gold !px-4 !py-2 text-sm flex items-center gap-2">
            <Plus size={16} /> افزودن مربی
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gold-500/10 text-right">
              <th className="p-4 text-xs text-gray-400">مربی</th>
              <th className="p-4 text-xs text-gray-400">رشته‌ها و کمیسیون</th>
              <th className="p-4 text-xs text-gray-400">درآمد دوره</th>
              <th className="p-4 text-xs text-gray-400">سهم</th>
              <th className="p-4 text-xs text-gray-400">تسویه‌شده</th>
              <th className="p-4 text-xs text-gray-400">مانده</th>
              <th className="p-4 text-xs text-gray-400">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {report.length === 0 && coaches.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-gray-500">هنوز مربی‌ای ثبت نشده است</td></tr>
            ) : report.length === 0 ? (
              coaches.filter((c) => c.is_active).map((c) => (
                <tr key={c.id} className="table-row">
                  <td className="p-4 text-sm text-white font-medium">{c.name}</td>
                  <td className="p-4 text-sm text-gray-300">
                    {c.sports.map((s) => (
                      <span key={s.sport} className="inline-block ml-1 mb-1 px-2 py-0.5 rounded-full bg-white/5 border border-gold-500/10 text-xs">
                        {s.sport}{s.commission_amount != null && s.commission_amount > 0 ? ` (${formatToman(s.commission_amount)})` : s.commission_percent ? ` (${s.commission_percent.toLocaleString('fa-IR')}٪)` : ''}
                      </span>
                    ))}
                  </td>
                  <td className="p-4 text-sm text-gray-300">—</td>
                  <td className="p-4 text-sm text-gray-300">—</td>
                  <td className="p-4 text-sm text-gray-300">—</td>
                  <td className="p-4 text-sm text-gray-300">—</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(c)} className="p-2 rounded-lg text-gray-400 hover:text-gold-400 hover:bg-gold-500/10 transition-colors" title="ویرایش"><Pencil size={16} /></button>
                      <button onClick={() => removeCoach(c)} className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="غیرفعال‌سازی"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            ) : report.map((r) => {
              const coach = coaches.find((c) => c.id === r.id);
              return (
                <tr key={r.id} className="table-row">
                  <td className="p-4 text-sm text-white font-medium">{r.name}</td>
                  <td className="p-4 text-sm text-gray-300">
                    {r.sports.map((s) => (
                      <span key={s.sport} className="inline-block ml-1 mb-1 px-2 py-0.5 rounded-full bg-white/5 border border-gold-500/10 text-xs">
                        {s.sport}{s.commission_amount != null && s.commission_amount > 0 ? ` (${formatToman(s.commission_amount)})` : s.commission_percent ? ` (${s.commission_percent.toLocaleString('fa-IR')}٪)` : ''}
                      </span>
                    ))}
                  </td>
                  <td className="p-4 text-sm text-gray-300">{formatToman(r.income)}</td>
                  <td className="p-4 text-sm text-gold-400 font-bold">{formatToman(r.share)}</td>
                  <td className="p-4 text-sm text-emerald-400">{formatToman(r.settled)}</td>
                  <td className={`p-4 text-sm font-bold ${r.remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{formatToman(r.remaining)}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSettleTarget(r); setSettleAmount(''); setSettleNote(''); setError(null); }}
                        disabled={r.remaining <= 0}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        تسویه
                      </button>
                      {coach && (
                        <>
                          <button onClick={() => openEdit(coach)} className="p-2 rounded-lg text-gray-400 hover:text-gold-400 hover:bg-gold-500/10 transition-colors" title="ویرایش"><Pencil size={16} /></button>
                          <button onClick={() => removeCoach(coach)} className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="غیرفعال‌سازی"><Trash2 size={16} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg glass-card p-8 animate-fade-in" style={{ maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users2 size={18} className="text-gold-400" />
                {form.id ? 'ویرایش مربی' : 'افزودن مربی'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">نام مربی *</label>
                <input className="input-dark" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="نام و نام خانوادگی" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">تلفن</label>
                <input className="input-dark" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="09123456789" />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="coachActive" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-amber-500" />
                <label htmlFor="coachActive" className="text-sm text-gray-300">مربی فعال است</label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm text-gray-400">رشته‌ها و کمیسیون</label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, sports: [...form.sports, { sport: '', commission_percent: '', commission_amount: '' }] })}
                    className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1"
                  >
                    <Plus size={14} /> افزودن رشته
                  </button>
                </div>
                {form.sports.length === 0 && <p className="text-xs text-gray-500 mb-2">هیچ رشته‌ای ثبت نشده (پرداخت‌های بدون کمیسیون)</p>}
                <div className="space-y-2">
                  {form.sports.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input className="input-dark flex-1" placeholder="نام رشته" value={s.sport} onChange={(e) => { const next = [...form.sports]; next[i] = { ...next[i], sport: e.target.value }; setForm({ ...form, sports: next }); }} />
                      <input className="input-dark !w-24" dir="ltr" type="number" min={0} max={100} placeholder="٪" value={s.commission_percent} onChange={(e) => { const next = [...form.sports]; next[i] = { ...next[i], commission_percent: e.target.value }; setForm({ ...form, sports: next }); }} />
                      <input className="input-dark !w-28" dir="ltr" type="number" min={0} placeholder="مبلغ" value={s.commission_amount} onChange={(e) => { const next = [...form.sports]; next[i] = { ...next[i], commission_amount: e.target.value }; setForm({ ...form, sports: next }); }} />
                      <button type="button" onClick={() => setForm({ ...form, sports: form.sports.filter((_, j) => j !== i) })} className="p-2 text-gray-400 hover:text-red-400"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={submitCoach} className="btn-gold w-full">
                {form.id ? 'ذخیره تغییرات' : 'ثبت مربی'}
              </button>
            </div>
          </div>
        </div>
      )}

      {settleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSettleTarget(null)} />
          <div className="relative w-full max-w-md glass-card p-8 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Banknote size={18} className="text-emerald-400" />
                تسویه «{settleTarget.name}»
              </h2>
              <button onClick={() => setSettleTarget(null)} className="text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl border border-gold-500/10 bg-white/5 text-sm">
                <span className="text-gray-400">مانده قابل تسویه</span>
                <span className="text-amber-400 font-bold">{formatToman(settleTarget.remaining)}</span>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">مبلغ تسویه *</label>
                <input type="number" className="input-dark" dir="ltr" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">توضیح (اختیاری)</label>
                <input className="input-dark" value={settleNote} onChange={(e) => setSettleNote(e.target.value)} placeholder="مثلاً تسویه مرداد" />
              </div>
              <button onClick={doSettle} className="btn-gold w-full">ثبت تسویه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Payments ────────────────────────── */

interface PaymentForm {
  member_id: number | null;
  member_name: string;
  amount: string;
  type: string;
  method: string;
  sport: string;
  note: string;
  date: string;
}

function PaymentsTab({ period }: { period: ApiPeriod }) {
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: '', method: '', sport: '', q: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [form, setForm] = useState<PaymentForm>({
    member_id: null, member_name: '', amount: '', type: 'manual', method: 'cash', sport: '', note: '', date: todayIso(),
  });

  const load = useCallback(async () => {
    const r = await getPayments(period, filters);
    if (r.data) { setPayments(r.data.rows); setTotal(r.data.total); }
    setLoading(false);
  }, [period, filters]);

  useEffect(() => { load(); }, [load]);

  const openAdd = async () => {
    setForm({ member_id: null, member_name: '', amount: '', type: 'manual', method: 'cash', sport: '', note: '', date: todayIso() });
    setMemberQuery('');
    setError(null);
    setModalOpen(true);
    const { data } = await getMembers();
    if (data) setMembers(data);
  };

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim();
    if (!q) return [];
    return members.filter((m) => m.full_name.includes(q) || m.phone.includes(q)).slice(0, 20);
  }, [members, memberQuery]);

  const submitPayment = async () => {
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { setError('مبلغ پرداخت را وارد کنید'); return; }
    const res = await createPayment({
      member_id: form.member_id,
      member_name: form.member_name || undefined,
      amount: amt,
      type: form.type,
      method: form.method,
      sport: form.sport.trim() || undefined,
      note: form.note.trim() || undefined,
      date: form.date || undefined,
    });
    if (res.error) { setError(res.error); return; }
    setModalOpen(false);
    await load();
  };

  const removePayment = async (p: ApiPayment) => {
    if (!confirm(`پرداخت ${formatToman(p.amount)} حذف شود؟`)) return;
    const res = await deletePayment(p.id);
    if (res.error) { setError(res.error); return; }
    await load();
  };

  const exportCsv = async () => {
    const p = new URLSearchParams({ from: period.from, to: period.to });
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    await downloadAccountingCsv(`/accounting/export/payments.csv?${p.toString()}`, `payments_${period.from}_${period.to}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-400">
          مجموع پرداخت‌های دوره: <span className="text-gold-400 font-bold">{formatToman(total)}</span>
        </p>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="btn-outline-gold !px-4 !py-2 text-sm flex items-center gap-2"><Download size={16} /> خروجی اکسل/CSV</button>
          <button onClick={openAdd} className="btn-gold !px-4 !py-2 text-sm flex items-center gap-2"><Plus size={16} /> ثبت پرداخت</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input className="input-dark" placeholder="جستجوی عضو..." value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select className="input-dark" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">همه انواع</option>
          {Object.entries(paymentTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input-dark" value={filters.method} onChange={(e) => setFilters({ ...filters, method: e.target.value })}>
          <option value="">همه روش‌ها</option>
          {Object.entries(paymentMethodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="input-dark" placeholder="نام رشته..." value={filters.sport} onChange={(e) => setFilters({ ...filters, sport: e.target.value })} />
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}</div>
        ) : payments.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-12">پرداختی در این بازه یافت نشد</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold-500/10 text-right">
                <th className="p-4 text-xs text-gray-400">عضو</th>
                <th className="p-4 text-xs text-gray-400">رشته</th>
                <th className="p-4 text-xs text-gray-400">مبلغ</th>
                <th className="p-4 text-xs text-gray-400">سهم مربی</th>
                <th className="p-4 text-xs text-gray-400">نوع</th>
                <th className="p-4 text-xs text-gray-400">روش</th>
                <th className="p-4 text-xs text-gray-400">تاریخ</th>
                <th className="p-4 text-xs text-gray-400"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="table-row">
                  <td className="p-4 text-sm text-white font-medium">{p.member_name || '—'}</td>
                  <td className="p-4 text-sm text-gray-300">{p.sport || '—'}</td>
                  <td className="p-4 text-sm text-gold-400 font-bold">{formatToman(p.amount)}</td>
                  <td className="p-4 text-sm text-gray-300">{p.coach_share ? formatToman(p.coach_share) : '—'}</td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded-full bg-white/5 border border-gold-500/10 text-xs text-gray-300">{paymentTypeLabel[p.type] || p.type}</span>
                  </td>
                  <td className="p-4 text-sm text-gray-300">{paymentMethodLabel[p.method] || p.method}</td>
                  <td className="p-4 text-sm text-gray-400">{new Date(p.created_at).toLocaleDateString('fa-IR')}</td>
                  <td className="p-4">
                    <button onClick={() => removePayment(p)} className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="حذف"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg glass-card p-8 animate-fade-in" style={{ maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Banknote size={18} className="text-gold-400" />
                ثبت پرداخت دستی
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">عضو</label>
                <div className="relative">
                  <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input className="input-dark pr-10" placeholder="جستجوی نام یا تلفن عضو..." value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} />
                </div>
                {filteredMembers.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1 rounded-xl border border-gold-500/10 bg-black/60 p-2">
                    {filteredMembers.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { setForm({ ...form, member_id: Number(m.id), member_name: m.full_name }); setMemberQuery(`${m.full_name} (${m.phone})`); }}
                        className="w-full text-right px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-gold-500/10 transition-colors"
                      >
                        {m.full_name} <span dir="ltr" className="text-xs text-gray-500">{m.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
                {form.member_id != null && (
                  <div className="mt-2 flex items-center justify-between p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-sm text-emerald-400">
                    <span className="flex items-center gap-2"><CheckCircle2 size={16} /> {form.member_name}</span>
                    <button onClick={() => { setForm({ ...form, member_id: null, member_name: '' }); setMemberQuery(''); }} className="text-gray-400 hover:text-red-400"><X size={16} /></button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">مبلغ (تومان) *</label>
                  <input type="number" dir="ltr" className="input-dark" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">تاریخ</label>
                  <input type="date" className="input-dark" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">نوع</label>
                  <select className="input-dark" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {Object.entries(paymentTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">روش پرداخت</label>
                  <select className="input-dark" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                    {Object.entries(paymentMethodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">رشته (برای محاسبه سهم مربی)</label>
                <input className="input-dark" value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })} placeholder="مثلاً بدنسازی" />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">توضیح (اختیاری)</label>
                <input className="input-dark" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="توضیحات" />
              </div>

              <button onClick={submitPayment} className="btn-gold w-full">ثبت پرداخت</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Expenses ────────────────────────── */

interface ExpenseForm {
  id: number | null;
  title: string;
  amount: string;
  category: string;
  date: string;
  note: string;
}

function ExpensesTab({ period }: { period: ApiPeriod }) {
  const [expenses, setExpenses] = useState<ApiExpense[]>([]);
  const [categories, setCategories] = useState<{ category: string; total: number; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ExpenseForm>({ id: null, title: '', amount: '', category: '', date: todayIso(), note: '' });

  const load = useCallback(async () => {
    const r = await getExpenses(period);
    if (r.data) {
      setExpenses(r.data.rows);
      setCategories(r.data.categories);
      setTotal(r.data.total);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ id: null, title: '', amount: '', category: '', date: todayIso(), note: '' });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (e: ApiExpense) => {
    setForm({ id: e.id, title: e.title, amount: String(e.amount), category: e.category, date: e.date, note: e.note || '' });
    setError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim()) { setError('عنوان هزینه الزامی است'); return; }
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { setError('مبلغ هزینه را وارد کنید'); return; }
    const payload = { title: form.title.trim(), amount: amt, category: form.category.trim() || 'عمومی', date: form.date || undefined, note: form.note.trim() || undefined };
    const res = form.id ? await updateExpense(form.id, payload) : await createExpense(payload);
    if (res.error) { setError(res.error); return; }
    setModalOpen(false);
    await load();
  };

  const remove = async (e: ApiExpense) => {
    if (!confirm(`هزینه «${e.title}» (${formatToman(e.amount)}) حذف شود؟`)) return;
    const res = await deleteExpense(e.id);
    if (res.error) { setError(res.error); return; }
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-400">
          مجموع هزینه‌های دوره: <span className="text-red-400 font-bold">{formatToman(total)}</span>
        </p>
        <button onClick={openAdd} className="btn-gold !px-4 !py-2 text-sm flex items-center gap-2"><Plus size={16} /> ثبت هزینه</button>
      </div>

      {categories.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {categories.map((c) => (
            <div key={c.category} className="stat-card !p-4">
              <p className="text-sm font-bold text-white">{formatToman(c.total)}</p>
              <p className="text-xs text-gray-500 mt-1">{c.category} ({c.count.toLocaleString('fa-IR')} مورد)</p>
            </div>
          ))}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}</div>
        ) : expenses.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-12">هزینه‌ای در این بازه ثبت نشده است</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold-500/10 text-right">
                <th className="p-4 text-xs text-gray-400">عنوان</th>
                <th className="p-4 text-xs text-gray-400">دسته</th>
                <th className="p-4 text-xs text-gray-400">مبلغ</th>
                <th className="p-4 text-xs text-gray-400">تاریخ</th>
                <th className="p-4 text-xs text-gray-400">ثبت توسط</th>
                <th className="p-4 text-xs text-gray-400"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="table-row">
                  <td className="p-4 text-sm text-white font-medium">{e.title}</td>
                  <td className="p-4"><span className="px-2 py-1 rounded-full bg-white/5 border border-gold-500/10 text-xs text-gray-300">{e.category}</span></td>
                  <td className="p-4 text-sm text-red-400 font-bold">{formatToman(e.amount)}</td>
                  <td className="p-4 text-sm text-gray-400">{new Date(e.date).toLocaleDateString('fa-IR')}</td>
                  <td className="p-4 text-sm text-gray-400">{e.recorded_by || '—'}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(e)} className="p-2 rounded-lg text-gray-400 hover:text-gold-400 hover:bg-gold-500/10 transition-colors" title="ویرایش"><Pencil size={16} /></button>
                      <button onClick={() => remove(e)} className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="حذف"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md glass-card p-8 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Receipt size={18} className="text-red-400" />
                {form.id ? 'ویرایش هزینه' : 'ثبت هزینه'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">عنوان هزینه *</label>
                <input className="input-dark" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثلاً قبض برق" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">مبلغ (تومان) *</label>
                  <input type="number" dir="ltr" className="input-dark" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">دسته</label>
                  <input className="input-dark" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="مثلاً قبض، اجاره، حقوق" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">تاریخ</label>
                <input type="date" className="input-dark" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">توضیح (اختیاری)</label>
                <textarea className="input-dark min-h-[80px] resize-y" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="توضیحات" />
              </div>
              <button onClick={submit} className="btn-gold w-full">{form.id ? 'ذخیره تغییرات' : 'ثبت هزینه'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Ledger ────────────────────────── */

function LedgerTab() {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ledger, setLedger] = useState<ApiLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMembers().then(({ data }) => { if (data) setMembers(data); });
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return members.filter((m) => m.full_name.includes(q) || m.phone.includes(q)).slice(0, 20);
  }, [members, query]);

  const pick = async (id: number) => {
    setSelectedId(id);
    setLoading(true);
    setError(null);
    const r = await getMemberLedger(id);
    if (r.error) { setError(r.error); setLoading(false); return; }
    setLedger(r.data);
    setQuery(`${r.data?.member.name} (${r.data?.member.phone})`);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-6">
        <label className="block text-sm text-gray-400 mb-2">جستجوی عضو</label>
        <div className="relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input-dark pr-10" placeholder="نام یا تلفن عضو..." value={query} onChange={(e) => { setQuery(e.target.value); setSelectedId(null); }} />
        </div>
        {results.length > 0 && selectedId == null && (
          <div className="mt-2 max-h-64 overflow-y-auto space-y-1 rounded-xl border border-gold-500/10 bg-black/60 p-2">
            {results.map((m) => (
              <button key={m.id} onClick={() => pick(Number(m.id))} className="w-full text-right px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-gold-500/10 transition-colors">
                {m.full_name} <span dir="ltr" className="text-xs text-gray-500">{m.phone}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}

      {loading && <div className="glass-card p-8 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}</div>}

      {ledger && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="stat-card">
              <p className="text-2xl font-bold text-gold-400">{formatToman(ledger.total_paid)}</p>
              <p className="text-xs text-gray-500 mt-1">مجموع پرداخت‌های ثبت‌شده</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-bold text-white">{ledger.payments.length.toLocaleString('fa-IR')}</p>
              <p className="text-xs text-gray-500 mt-1">تعداد پرداخت</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-bold text-white">{ledger.renewals.length.toLocaleString('fa-IR')}</p>
              <p className="text-xs text-gray-500 mt-1">تعداد تمدید</p>
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <h3 className="text-lg font-semibold text-white p-6 pb-0">پرداخت‌های {ledger.member.name}</h3>
            <table className="w-full mt-4">
              <thead>
                <tr className="border-b border-gold-500/10 text-right">
                  <th className="p-4 text-xs text-gray-400">مبلغ</th>
                  <th className="p-4 text-xs text-gray-400">نوع</th>
                  <th className="p-4 text-xs text-gray-400">روش</th>
                  <th className="p-4 text-xs text-gray-400">توضیح</th>
                  <th className="p-4 text-xs text-gray-400">تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {ledger.payments.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-sm text-gray-500">پرداختی ثبت نشده است</td></tr>
                ) : ledger.payments.map((p) => (
                  <tr key={p.id} className="table-row">
                    <td className="p-4 text-sm text-gold-400 font-bold">{formatToman(p.amount)}</td>
                    <td className="p-4 text-sm text-gray-300">{paymentTypeLabel[p.type] || p.type}</td>
                    <td className="p-4 text-sm text-gray-300">{paymentMethodLabel[p.method] || p.method}</td>
                    <td className="p-4 text-sm text-gray-400">{p.note || '—'}</td>
                    <td className="p-4 text-sm text-gray-400">{new Date(p.created_at).toLocaleDateString('fa-IR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="glass-card overflow-hidden">
            <h3 className="text-lg font-semibold text-white p-6 pb-0">تمدیدهای {ledger.member.name}</h3>
            <table className="w-full mt-4">
              <thead>
                <tr className="border-b border-gold-500/10 text-right">
                  <th className="p-4 text-xs text-gray-400">مبلغ</th>
                  <th className="p-4 text-xs text-gray-400">نوع اشتراک</th>
                  <th className="p-4 text-xs text-gray-400">از</th>
                  <th className="p-4 text-xs text-gray-400">تا</th>
                  <th className="p-4 text-xs text-gray-400">وضعیت</th>
                  <th className="p-4 text-xs text-gray-400">تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {ledger.renewals.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-sm text-gray-500">تمدیدی ثبت نشده است</td></tr>
                ) : ledger.renewals.map((r) => (
                  <tr key={r.id} className="table-row">
                    <td className="p-4 text-sm text-gold-400 font-bold">{formatToman(r.amount)}</td>
                    <td className="p-4 text-sm text-gray-300">{r.membership_type || '—'}</td>
                    <td className="p-4 text-sm text-gray-400">{r.old_end_date ? new Date(r.old_end_date).toLocaleDateString('fa-IR') : '—'}</td>
                    <td className="p-4 text-sm text-gray-400">{r.new_end_date ? new Date(r.new_end_date).toLocaleDateString('fa-IR') : '—'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${r.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : r.status === 'pending' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                        {r.status === 'completed' ? 'کامل' : r.status === 'pending' ? 'در انتظار' : 'لغو'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-400">{new Date(r.created_at).toLocaleDateString('fa-IR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Locked screen ────────────────────────── */

function LockedScreen({ onBack }: { onBack: () => void }) {
  return (
    <FeatureLockedScreen
      icon={Wallet}
      title="بخش حسابداری ویژه"
      description="این بخش با اشتراک ماهانه + هزینه فعال‌سازی در پکیج «مدیریت هوشمند» فعال می‌شود و شامل داشبورد مالی، درآمد به تفکیک رشته، سهم مربی با تسویه، دفتر پرداخت، هزینه‌ها، سود خالص و خروجی اکسل/CSV است."
      onBack={onBack}
    />
  );
}
