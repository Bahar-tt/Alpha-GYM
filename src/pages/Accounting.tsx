import { useCallback, useEffect, useState } from 'react';
import {
  getAccountingSummary,
  addPayment,
  deletePayment,
  addExpense,
  deleteExpense,
  getCoachPayroll,
  getMemberFinancialAlerts,
  getExpenses,
  type Expense,
  type AccountingSummary,
} from '../services/accountingService';
import { getCoaches, type Coach } from '../services/coachService';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { formatJalali, jalaliToGregorianIso, todayJalali, type JalaliDate } from '../lib/jalaliDate';
import {
  Wallet,
  TrendingUp,
  Percent,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  Plus,
  Trash2,
  X,
  RefreshCcw,
  PieChart,
  BarChart3,
  Download,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type Tab = 'overview' | 'specialty' | 'coaches' | 'payroll' | 'payments' | 'expenses' | 'ledger';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'خلاصه' },
  { id: 'specialty', label: 'درآمد رشته‌ها' },
  { id: 'coaches', label: 'سهم مربی' },
  { id: 'payroll', label: 'حقوق و تسویه مربیان' },
  { id: 'payments', label: 'دریافت‌ها و پرداخت‌ها' },
  { id: 'expenses', label: 'هزینه‌ها' },
  { id: 'ledger', label: 'دفتر مالی' },
];

const EXPENSE_CATEGORIES = ['اجاره', 'قبوض', 'تجهیزات', 'حقوق', 'تبلیغات', 'تعمیرات', 'عمومی'];

function fmt(n: number) {
  return Math.round(n).toLocaleString('fa-IR');
}

function paymentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    registration: 'ثبت‌نام عضو', renewal: 'تمدید عضویت', member_fee: 'دریافت شهریه',
    coach_payout: 'پرداخت سهم مربی', manual: 'ثبت دستی', fee: 'دریافت کارمزد', other: 'سایر',
  };
  return labels[type] || 'تراکنش مالی';
}

function paymentMethodLabel(method?: string) {
  const labels: Record<string, string> = {
    cash: 'نقدی', card: 'کارتخوان', transfer: 'واریز بانکی', pos: 'کارتخوان', gateway: 'درگاه پرداخت', other: 'سایر',
  };
  return labels[method || ''] || 'ثبت نشده';
}

function downloadReport(data: AccountingSummary, from: JalaliDate, to: JalaliDate, format: 'excel' | 'pdf') {
  const rows = [
    ['گزارش حسابداری Alpha Gym', '', '', ''],
    ['بازه', `${from.year}/${String(from.month).padStart(2, '0')}/${String(from.day).padStart(2, '0')}`, `${to.year}/${String(to.month).padStart(2, '0')}/${String(to.day).padStart(2, '0')}`, ''],
    [],
    ['تاریخ', 'نوع', 'شرح', 'مبلغ'],
    ...data.ledger.map((item) => [formatJalali(String(item.date).slice(0, 10)), item.kind === 'expense' ? 'هزینه' : item.direction === 'in' ? 'ورود' : 'خروج', item.title, String(item.amount)]),
  ];
  if (format === 'excel') {
    const content = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join('\t')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `alpha-gym-accounting-${from.year}-${from.month}-${from.day}.xls`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  const printableRows = rows.slice(3).map((row) => `<tr>${row.map((cell) => `<td>${String(cell).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c))}</td>`).join('')}</tr>`).join('');
  const printWindow = window.open('', '_blank', 'width=1000,height=700');
  if (!printWindow) return;
  printWindow.document.write(`<html dir="rtl"><head><title>گزارش حسابداری Alpha Gym</title><style>body{font-family:Tahoma,Arial;padding:32px;color:#222}h1{font-size:22px}table{border-collapse:collapse;width:100%;margin-top:24px}td{border:1px solid #ccc;padding:8px;text-align:right}tr:nth-child(1){background:#f1f1f1;font-weight:bold}</style></head><body><h1>گزارش حسابداری Alpha Gym</h1><p>بازه: ${rows[1][1]} تا ${rows[1][2]}</p><table>${printableRows}</table></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export default function Accounting() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [payroll, setPayroll] = useState<{ coach_id: number; coach_name: string; gross: number; net: number; items: number }[]>([]);
  const [alerts, setAlerts] = useState<{ member_name: string; alert_type: 'overdue' | 'due_soon'; due_date: string; amount: number }[]>([]);
  const [showPay, setShowPay] = useState(false);
  const [showExp, setShowExp] = useState(false);
  const [fromDate, setFromDate] = useState<JalaliDate>(() => {
    const today = todayJalali();
    return { ...today, day: 1 };
  });
  const [toDate, setToDate] = useState<JalaliDate>(() => todayJalali());
  const [outputFormat, setOutputFormat] = useState('');

  const load = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true);
    const [s, c, p, a] = await Promise.all([
      getAccountingSummary(jalaliToGregorianIso(fromDate), jalaliToGregorianIso(toDate)),
      getCoaches(),
      getCoachPayroll(jalaliToGregorianIso(fromDate), jalaliToGregorianIso(toDate)),
      getMemberFinancialAlerts(7),
    ]);
    if (s.data) setData(s.data);
    setCoaches(c.data || []);
    setPayroll(p.data || []);
    setAlerts(a.data?.rows || []);
    setLoading(false);
  }, [fromDate, toDate, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const t = data?.totals;

  if (!isAdmin) return <StaffExpenseAccounting />;

  return (
    <div className="space-y-6">
      <div
        className="page-hero flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="page-title">حسابداری</h1>
          <p className="page-subtitle">درآمد، سهم مربی، پرداخت‌ها، هزینه و گردش حساب</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="sr-only" htmlFor="accounting-output">نوع خروجی</label>
          <div className="relative">
            <Download size={15} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--accent)' }} />
            <select
              id="accounting-output"
              className="input-field pr-9 min-w-[150px]"
              value={outputFormat}
              onChange={(e) => {
                const value = e.target.value;
                setOutputFormat('');
                if (value && data) downloadReport(data, fromDate, toDate, value as 'excel' | 'pdf');
              }}
            >
              <option value="">دانلود گزارش</option>
              <option value="excel">Excel</option>
              <option value="pdf">PDF / چاپ</option>
            </select>
          </div>
          <button type="button" className="btn-outline" onClick={load} title="بروزرسانی گزارش">
            <RefreshCcw size={16} />
            بروزرسانی
          </button>
          <button type="button" className="btn-outline" onClick={() => setShowExp(true)}>
            <Plus size={16} />
            هزینه
          </button>
          <button type="button" className="btn-primary" onClick={() => setShowPay(true)}>
            <Plus size={16} />
            پرداخت
          </button>
        </div>
      </div>

      <div className="panel-card p-4 overflow-visible relative z-20">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            <JalaliDatePicker label="از تاریخ" value={fromDate} onChange={(d) => d && setFromDate(d)} required />
            <JalaliDatePicker label="تا تاریخ" value={toDate} onChange={(d) => d && setToDate(d)} required />
          </div>
          <button type="button" className="btn-primary h-11 shrink-0" onClick={load}>نمایش گزارش</button>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          تاریخ‌ها فقط از تقویم شمسی انتخاب می‌شوند و در گزارش نیز به‌صورت جلالی نمایش داده خواهند شد.
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={TrendingUp}
          label="درآمد ماهانه (شهریه)"
          value={t ? fmt(t.monthly_revenue) : '—'}
          tone="accent"
        />
        <Kpi
          icon={Percent}
          label="سهم مربیان"
          value={t ? fmt(t.coach_share) : '—'}
          tone="gold"
        />
        <Kpi
          icon={Wallet}
          label="سود بالقوه"
          value={t ? fmt(t.potential_net) : '—'}
          tone="success"
        />
        <Kpi
          icon={Receipt}
          label="موجودی نقدی (گردش)"
          value={t ? fmt(t.net_balance) : '—'}
          tone={t && t.net_balance >= 0 ? 'success' : 'danger'}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label="ورودی پرداخت‌ها" value={t ? fmt(t.payments_in) : '—'} color="var(--success)" />
        <Mini label="خروجی پرداخت‌ها" value={t ? fmt(t.payments_out) : '—'} color="var(--warning)" />
        <Mini label="هزینه‌ها" value={t ? fmt(t.expenses) : '—'} color="var(--danger)" />
        <Mini label="اعضای فعال" value={t ? fmt(t.active_members) : '—'} color="var(--accent)" />
      </div>

      {/* Tabs */}
      <div
        className="flex flex-wrap gap-1 p-1 rounded-2xl"
        style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
      >
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className="px-3.5 py-2 rounded-xl text-sm font-medium"
            style={{
              background: tab === x.id ? 'var(--bg-elevated)' : 'transparent',
              color: tab === x.id ? 'var(--accent)' : 'var(--text-secondary)',
              boxShadow: tab === x.id ? 'var(--shadow)' : 'none',
            }}
          >
            {x.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 skeleton" />
          ))}
        </div>
      )}

      {!loading && data && tab === 'overview' && (
        <>
        {alerts.length > 0 && <div className="panel-card p-4" style={{ borderColor: 'var(--warning)' }}><div className="flex items-center justify-between gap-3"><div><strong style={{ color: 'var(--warning)' }}>هشدار مالی اعضا</strong><p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{alerts.filter((x) => x.alert_type === 'overdue').length} بدهی عقب‌افتاده و {alerts.filter((x) => x.alert_type === 'due_soon').length} سررسید نزدیک</p></div><button type="button" className="btn-outline" onClick={() => setTab('payroll')}>مشاهده حقوق و هشدارها</button></div></div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="panel-card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <PieChart size={16} style={{ color: 'var(--accent)' }} />
              ترکیب مالی ماهانه
            </h3>
            <BarRow label="درآمد شهریه" value={data.totals.monthly_revenue} max={Math.max(data.totals.monthly_revenue, 1)} color="var(--accent)" />
            <BarRow label="سهم مربی" value={data.totals.coach_share} max={Math.max(data.totals.monthly_revenue, 1)} color="var(--gold)" />
            <BarRow label="سود بالقوه" value={data.totals.potential_net} max={Math.max(data.totals.monthly_revenue, 1)} color="var(--success)" />
            <BarRow label="هزینه‌های ثبت‌شده" value={data.totals.expenses} max={Math.max(data.totals.monthly_revenue, data.totals.expenses, 1)} color="var(--danger)" />
          </div>
          <div className="panel-card p-5">
            <h3 className="section-title mb-4">گردش نقدی واقعی</h3>
            <div className="space-y-3 text-sm">
              <FlowRow icon={ArrowDownCircle} label="ورود پول" value={data.totals.cash_in} positive />
              <FlowRow icon={ArrowUpCircle} label="خروج پول" value={data.totals.cash_out} positive={false} />
              <div
                className="flex justify-between items-center p-4 rounded-xl font-bold text-base"
                style={{
                  background: data.totals.net_balance >= 0 ? 'var(--success-soft)' : 'var(--danger-soft)',
                  color: data.totals.net_balance >= 0 ? 'var(--success)' : 'var(--danger)',
                }}
              >
                <span>مانده</span>
                <span>{fmt(data.totals.net_balance)} تومان</span>
              </div>
            </div>
          </div>
        </div>
        <AnalyticsPanel analytics={data.analytics} />
        </>
      )}

      {!loading && data && tab === 'specialty' && (
        <div className="panel-card overflow-hidden">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr style={{ background: 'var(--bg-muted)' }}>
                {['رشته', 'اعضا', 'درآمد', 'سهم مربی', 'سهم باشگاه'].map((h) => (
                  <th key={h} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.by_specialty.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
                    هنوز شهریه/رشته‌ای ثبت نشده — برای اعضا هزینه ماهانه و مربی تنظیم کنید
                  </td>
                </tr>
              ) : (
                data.by_specialty.map((r) => (
                  <tr key={r.specialty} className="table-row">
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {r.specialty}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {fmt(r.members)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                      {fmt(r.revenue)}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--gold)' }}>
                      {fmt(r.coach_share)}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--success)' }}>
                      {fmt(r.revenue - r.coach_share)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && data && tab === 'coaches' && (
        <div className="panel-card overflow-hidden">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr style={{ background: 'var(--bg-muted)' }}>
                {['مربی', 'رشته', 'اعضا', 'درآمد', 'درصد', 'سهم مربی'].map((h) => (
                  <th key={h} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.by_coach.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
                    عضوی به مربی وصل نشده
                  </td>
                </tr>
              ) : (
                data.by_coach.map((r) => (
                  <tr key={r.coach_id ?? r.coach_name} className="table-row">
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {r.coach_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge badge-info">{r.specialty}</span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {fmt(r.members)}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--accent)' }}>
                      {fmt(r.revenue)}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {fmt(r.commission_percent)}%
                    </td>
                    <td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--gold)' }}>
                      {fmt(r.coach_share)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && data && tab === 'payroll' && (
        <PayrollPanel rows={payroll} alerts={alerts} />
      )}

      {!loading && data && tab === 'payments' && (
        <PaymentsTable
          rows={data.payments}
          onDelete={async (id) => {
            await deletePayment(id);
            load();
          }}
        />
      )}

      {!loading && data && tab === 'expenses' && (
        <ExpensesTable
          rows={data.expenses}
          onDelete={async (id) => {
            await deleteExpense(id);
            load();
          }}
        />
      )}

      {!loading && data && tab === 'ledger' && (
        <div className="panel-card overflow-hidden">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr style={{ background: 'var(--bg-muted)' }}>
                {['تاریخ', 'شرح تراکنش', 'جریان مالی', 'مبلغ'].map((h) => (
                  <th key={h} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.ledger.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
                    هنوز تراکنشی ثبت نشده
                  </td>
                </tr>
              ) : (
                data.ledger.map((item) => (
                  <tr key={item.id} className="table-row">
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatJalali(String(item.date).slice(0, 10))}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text)' }}>
                      {item.title}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${item.direction === 'in' ? 'badge-success' : 'badge-danger'}`}>
                        {item.kind === 'expense' ? 'هزینه' : item.direction === 'in' ? 'دریافت' : 'پرداخت'}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-sm font-bold"
                      style={{ color: item.direction === 'in' ? 'var(--success)' : 'var(--danger)' }}
                    >
                      {item.direction === 'in' ? '+' : '−'}
                      {fmt(item.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showPay && (
        <PaymentModal
          coaches={coaches}
          onClose={() => setShowPay(false)}
          onSave={async (payload) => {
            await addPayment(payload);
            setShowPay(false);
            load();
          }}
        />
      )}

      {showExp && (
        <ExpenseModal
          onClose={() => setShowExp(false)}
          onSave={async (payload) => {
            await addExpense(payload);
            setShowExp(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone: string;
}) {
  const colors: Record<string, { bg: string; c: string }> = {
    accent: { bg: 'var(--accent-soft)', c: 'var(--accent)' },
    gold: { bg: 'var(--gold-soft)', c: 'var(--gold)' },
    success: { bg: 'var(--success-soft)', c: 'var(--success)' },
    danger: { bg: 'var(--danger-soft)', c: 'var(--danger)' },
  };
  const t = colors[tone] || colors.accent;
  return (
    <div className="stat-card">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: t.bg, color: t.c }}>
        <Icon size={18} />
      </div>
      <p className="text-xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
        {value}
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </p>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="panel-card p-3">
      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="text-lg font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span className="font-semibold" style={{ color: 'var(--text)' }}>
          {fmt(value)}
        </span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function FlowRow({
  icon: Icon,
  label,
  value,
  positive,
}: {
  icon: typeof ArrowDownCircle;
  label: string;
  value: number;
  positive: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg-muted)' }}>
      <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <Icon size={16} style={{ color: positive ? 'var(--success)' : 'var(--danger)' }} />
        {label}
      </span>
      <span className="font-bold" style={{ color: positive ? 'var(--success)' : 'var(--danger)' }}>
        {fmt(value)}
      </span>
    </div>
  );
}

function PayrollPanel({ rows, alerts }: { rows: { coach_id: number; coach_name: string; gross: number; net: number; items: number }[]; alerts: { member_name: string; alert_type: 'overdue' | 'due_soon'; due_date: string; amount: number }[] }) {
  return <div className="space-y-4"><div className="panel-card overflow-hidden"><div className="p-5"><h3 className="section-title">حقوق و تسویه مربیان</h3><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>سهم‌های ثبت‌شده، حقوق ثابت و اقلام قابل تسویه در بازه انتخاب‌شده</p></div><table className="w-full"><thead><tr style={{ background: 'var(--bg-muted)' }}>{['مربی', 'تعداد اقلام', 'ناخالص', 'قابل پرداخت'].map((h) => <th key={h} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={4} className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>موردی برای این بازه ثبت نشده است</td></tr> : rows.map((r) => <tr className="table-row" key={r.coach_id}><td className="px-4 py-3 text-sm font-medium">{r.coach_name}</td><td className="px-4 py-3 text-sm">{fmt(r.items)}</td><td className="px-4 py-3 text-sm">{fmt(r.gross)}</td><td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--gold)' }}>{fmt(r.net)}</td></tr>)}</tbody></table></div><div className="panel-card overflow-hidden"><div className="p-5"><h3 className="section-title">هشدار بدهی و سررسید شهریه</h3></div>{alerts.length === 0 ? <p className="p-5 text-sm" style={{ color: 'var(--text-muted)' }}>هشداری وجود ندارد</p> : <table className="w-full"><thead><tr style={{ background: 'var(--bg-muted)' }}>{['عضو', 'وضعیت', 'سررسید', 'مبلغ برآوردی'].map((h) => <th key={h} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead><tbody>{alerts.map((a, i) => <tr className="table-row" key={`${a.member_name}-${a.due_date}-${i}`}><td className="px-4 py-3 text-sm">{a.member_name}</td><td className="px-4 py-3"><span className={`badge ${a.alert_type === 'overdue' ? 'badge-danger' : 'badge-warning'}`}>{a.alert_type === 'overdue' ? 'بدهی / منقضی' : 'سررسید نزدیک'}</span></td><td className="px-4 py-3 text-sm">{formatJalali(a.due_date)}</td><td className="px-4 py-3 text-sm font-bold">{fmt(a.amount)}</td></tr>)}</tbody></table>}</div></div>;
}

function AnalyticsPanel({ analytics }: { analytics: AccountingSummary['analytics'] }) {
  const trend = analytics?.monthly_trend || [];
  const maxTrend = Math.max(1, ...trend.flatMap((x) => [x.income, x.payout, x.expense]));
  const paymentMix = analytics?.payment_mix || [];
  const expenseMix = analytics?.expense_mix || [];
  const maxPayment = Math.max(1, ...paymentMix.map((x) => x.amount));
  const maxExpense = Math.max(1, ...expenseMix.map((x) => x.amount));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="panel-card p-5 lg:col-span-2">
          <h3 className="section-title mb-1 flex items-center gap-2"><BarChart3 size={16} style={{ color: 'var(--accent)' }} />روند ماهانه جریان مالی</h3>
          <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>بر مبنای دریافت، پرداخت و هزینه واقعی ثبت‌شده</p>
          {trend.length === 0 ? <EmptyAnalytics /> : <div className="space-y-4">{trend.map((row) => (
            <div key={row.month}>
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                <span>{formatJalali(`${row.month}-01`)}</span>
                <strong style={{ color: row.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>خالص: {fmt(row.net)}</strong>
              </div>
              <div className="space-y-1">
                <MetricBar label="دریافت" value={row.income} max={maxTrend} color="var(--success)" />
                <MetricBar label="پرداخت" value={row.payout} max={maxTrend} color="var(--warning)" />
                <MetricBar label="هزینه" value={row.expense} max={maxTrend} color="var(--danger)" />
              </div>
            </div>
          ))}</div>}
        </div>
        <div className="panel-card p-5">
          <h3 className="section-title mb-1">شاخص‌های عملکرد</h3>
          <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>خلاصه بازه انتخاب‌شده</p>
          <div className="space-y-3">
            <Insight label="خالص واقعی" value={`${fmt(analytics?.actual_net || 0)} تومان`} tone={(analytics?.actual_net || 0) >= 0 ? 'success' : 'danger'} />
            <Insight label="حاشیه سود نقدی" value={`${fmt(analytics?.profit_margin || 0)}٪`} tone="accent" />
            <Insight label="ماه‌های دارای تراکنش" value={fmt(trend.length)} tone="gold" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MixCard title="ترکیب روش دریافت/پرداخت" rows={paymentMix} max={maxPayment} />
        <MixCard title="ترکیب هزینه‌ها" rows={expenseMix} max={maxExpense} danger />
      </div>
    </div>
  );
}

function MetricBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return <div className="flex items-center gap-2 text-[11px]"><span className="w-12" style={{ color: 'var(--text-muted)' }}>{label}</span><div className="h-2 rounded-full overflow-hidden flex-1" style={{ background: 'var(--bg-muted)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} /></div><span className="w-24 text-left" style={{ color: 'var(--text-secondary)' }}>{fmt(value)}</span></div>;
}

function MixCard({ title, rows, max, danger = false }: { title: string; rows: { label: string; count: number; amount: number }[]; max: number; danger?: boolean }) {
  return <div className="panel-card p-5"><h3 className="section-title mb-4">{title}</h3>{rows.length === 0 ? <EmptyAnalytics /> : <div className="space-y-3">{rows.slice(0, 8).map((row) => <div key={row.label}><div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}><span>{row.label}</span><span>{fmt(row.amount)} تومان · {fmt(row.count)} مورد</span></div><div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (row.amount / max) * 100)}%`, background: danger ? 'var(--danger)' : 'var(--accent)' }} /></div></div>)}</div>}</div>;
}

function Insight({ label, value, tone }: { label: string; value: string; tone: 'success' | 'danger' | 'accent' | 'gold' }) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : tone === 'gold' ? 'var(--gold)' : 'var(--accent)';
  return <div className="p-4 rounded-xl" style={{ background: 'var(--bg-muted)' }}><p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p><p className="text-lg font-bold mt-1" style={{ color }}>{value}</p></div>;
}

function EmptyAnalytics() {
  return <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>در این بازه داده‌ای برای تحلیل ثبت نشده است</div>;
}

function PaymentsTable({
  rows,
  onDelete,
}: {
  rows: AccountingSummary['payments'];
  onDelete: (id: number) => void;
}) {
  return (
    <div className="panel-card overflow-hidden">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr style={{ background: 'var(--bg-muted)' }}>
            {['تاریخ', 'شرح تراکنش', 'نوع عملیات', 'روش پرداخت', 'مربی / سهم', 'دریافت/پرداخت', 'مبلغ', ''].map((h) => (
              <th key={h || 'a'} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
                پرداختی ثبت نشده
              </td>
            </tr>
          ) : (
            rows.map((p) => (
              <tr key={p.id} className="table-row">
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatJalali(String(p.paid_at).slice(0, 10))}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text)' }}>
                  {p.title || paymentTypeLabel(p.type)}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {paymentTypeLabel(p.type)}
                </td>
                <td className="px-4 py-3">
                  <span className="badge badge-info">{paymentMethodLabel(p.method)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.coach_name || 'بدون مربی'}</div>
                  {p.coach_share_amount ? <div className="text-[11px] mt-1" style={{ color: 'var(--gold)' }}>{fmt(p.coach_share_amount)} ({fmt(p.coach_share_percent || 0)}٪)</div> : null}
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${p.direction === 'in' ? 'badge-success' : 'badge-danger'}`}>
                    {p.direction === 'in' ? 'دریافت' : 'پرداخت'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--text)' }}>
                  {fmt(p.amount)}
                </td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onDelete(p.id)} style={{ color: 'var(--text-muted)' }}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StaffExpenseAccounting() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [showExpense, setShowExpense] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    const result = await getExpenses();
    if (result.error) setError(result.error.message);
    else setRows(result.data?.rows || []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  const save = async (payload: { category: string; title: string; amount: number; spent_at?: string }) => {
    const result = await addExpense(payload);
    if (result.error) { setError(result.error.message); return; }
    setShowExpense(false); await load();
  };
  return <div className="space-y-6" dir="rtl">
    <div className="page-hero flex flex-wrap items-center justify-between gap-4"><div><h1 className="page-title">ثبت هزینه‌های جاری</h1><p className="page-subtitle">این بخش فقط برای ثبت هزینه‌های جاری منشی فعال است.</p></div><button type="button" className="btn-primary" onClick={() => setShowExpense(true)}><Plus size={16} /> ثبت هزینه جاری</button></div>
    {error && <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>{error}</div>}
    <div className="panel-card overflow-hidden"><table className="w-full min-w-[560px]"><thead><tr style={{ background: 'var(--bg-muted)' }}>{['تاریخ', 'دسته‌بندی', 'عنوان', 'مبلغ'].map((h) => <th key={h} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={4} className="p-8 text-center text-sm">در حال دریافت…</td></tr> : rows.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>هزینه‌ای ثبت نشده است.</td></tr> : rows.map((e) => <tr key={e.id} className="table-row"><td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{formatJalali(String(e.spent_at).slice(0, 10))}</td><td className="px-4 py-3"><span className="badge badge-warning">{e.category}</span></td><td className="px-4 py-3 text-sm">{e.title}</td><td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--danger)' }}>{fmt(e.amount)}</td></tr>)}</tbody></table></div>
    {showExpense && <ExpenseModal onClose={() => setShowExpense(false)} onSave={save} />}
  </div>;
}

function ExpensesTable({
  rows,
  onDelete,
}: {
  rows: AccountingSummary['expenses'];
  onDelete: (id: number) => void;
}) {
  return (
    <div className="panel-card overflow-hidden">
      <table className="w-full min-w-[560px]">
        <thead>
          <tr style={{ background: 'var(--bg-muted)' }}>
            {['تاریخ', 'دسته‌بندی', 'عنوان', 'مبلغ', ''].map((h) => (
              <th key={h || 'a'} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
                هزینه‌ای ثبت نشده
              </td>
            </tr>
          ) : (
            rows.map((e) => (
              <tr key={e.id} className="table-row">
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatJalali(String(e.spent_at).slice(0, 10))}
                </td>
                <td className="px-4 py-3">
                  <span className="badge badge-warning">{e.category}</span>
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text)' }}>
                  {e.title}
                </td>
                <td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--danger)' }}>
                  {fmt(e.amount)}
                </td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onDelete(e.id)} style={{ color: 'var(--text-muted)' }}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PaymentModal({
  coaches,
  onClose,
  onSave,
}: {
  coaches: Coach[];
  onClose: () => void;
  onSave: (p: {
    type: string;
    amount: number;
    direction: 'in' | 'out';
    coach_id?: number | null;
    title?: string;
    notes?: string;
    paid_at?: string;
  }) => Promise<void>;
}) {
  const [type, setType] = useState('member_fee');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [coachId, setCoachId] = useState('');
  const [paidAt, setPaidAt] = useState<JalaliDate>(() => todayJalali());
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await onSave({
            type,
            amount: Number(amount) || 0,
            direction,
            coach_id: coachId ? Number(coachId) : null,
            title: title || undefined,
            paid_at: jalaliToGregorianIso(paidAt),
          });
          setSaving(false);
        }}
      >
        <div className="px-5 py-4 flex justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-bold" style={{ color: 'var(--text)' }}>ثبت پرداخت</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>نوع</label>
            <select className="input-field" value={type} onChange={(e) => {
              setType(e.target.value);
              if (e.target.value === 'coach_payout') setDirection('out');
              if (e.target.value === 'member_fee') setDirection('in');
            }}>
              <option value="member_fee">دریافت شهریه عضو</option>
              <option value="coach_payout">پرداخت سهم مربی</option>
              <option value="other">سایر</option>
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>جهت</label>
            <select className="input-field" value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
              <option value="in">ورود (دریافت)</option>
              <option value="out">خروج (پرداخت)</option>
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>مبلغ (تومان)</label>
            <input className="input-field" type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>عنوان</label>
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {type === 'coach_payout' && (
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>مربی</label>
              <select className="input-field" value={coachId} onChange={(e) => setCoachId(e.target.value)}>
                <option value="">—</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
          )}
          <JalaliDatePicker label="تاریخ پرداخت" value={paidAt} onChange={(d) => d && setPaidAt(d)} required />
        </div>
        <div className="px-5 py-4 flex flex-row-reverse gap-2" style={{ background: 'var(--bg-muted)' }}>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? '...' : 'ثبت'}</button>
          <button type="button" className="btn-outline" onClick={onClose}>انصراف</button>
        </div>
      </form>
    </div>
  );
}

function ExpenseModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (p: { category: string; title: string; amount: number; spent_at?: string }) => Promise<void>;
}) {
  const [category, setCategory] = useState('عمومی');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState<JalaliDate>(() => todayJalali());
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await onSave({ category, title, amount: Number(amount) || 0, spent_at: jalaliToGregorianIso(spentAt) });
          setSaving(false);
        }}
      >
        <div className="px-5 py-4 flex justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-bold" style={{ color: 'var(--text)' }}>ثبت هزینه</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>دسته‌بندی</label>
            <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>عنوان</label>
            <input className="input-field" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>مبلغ (تومان)</label>
            <input className="input-field" type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <JalaliDatePicker label="تاریخ هزینه" value={spentAt} onChange={(d) => d && setSpentAt(d)} required />
        </div>
        <div className="px-5 py-4 flex flex-row-reverse gap-2" style={{ background: 'var(--bg-muted)' }}>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? '...' : 'ثبت'}</button>
          <button type="button" className="btn-outline" onClick={onClose}>انصراف</button>
        </div>
      </form>
    </div>
  );
}
