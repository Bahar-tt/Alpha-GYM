import { useCallback, useEffect, useState } from 'react';
import {
  getAccountingSummary,
  addPayment,
  deletePayment,
  addExpense,
  deleteExpense,
  type AccountingSummary,
} from '../services/accountingService';
import { getCoaches, type Coach } from '../services/coachService';
import {
  Wallet,
  TrendingUp,
  Users,
  Percent,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  Plus,
  Trash2,
  X,
  RefreshCcw,
  PieChart,
} from 'lucide-react';

type Tab = 'overview' | 'specialty' | 'coaches' | 'payments' | 'expenses' | 'ledger';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'خلاصه' },
  { id: 'specialty', label: 'درآمد رشته‌ها' },
  { id: 'coaches', label: 'سهم مربی' },
  { id: 'payments', label: 'پرداخت‌ها' },
  { id: 'expenses', label: 'هزینه‌ها' },
  { id: 'ledger', label: 'گردش حساب' },
];

const EXPENSE_CATEGORIES = ['اجاره', 'قبوض', 'تجهیزات', 'حقوق', 'تبلیغات', 'تعمیرات', 'عمومی'];

function fmt(n: number) {
  return Math.round(n).toLocaleString('fa-IR');
}

export default function Accounting() {
  const [data, setData] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [showPay, setShowPay] = useState(false);
  const [showExp, setShowExp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, c] = await Promise.all([getAccountingSummary(), getCoaches()]);
    if (s.data) setData(s.data);
    setCoaches(c.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const t = data?.totals;

  return (
    <div className="space-y-6">
      <div
        className="page-hero flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="page-title">حسابداری</h1>
          <p className="page-subtitle">درآمد، سهم مربی، پرداخت‌ها، هزینه و گردش حساب</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" onClick={load}>
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
                {['تاریخ', 'شرح', 'نوع', 'مبلغ'].map((h) => (
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
                      {item.date}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text)' }}>
                      {item.title}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${item.direction === 'in' ? 'badge-success' : 'badge-danger'}`}>
                        {item.kind === 'expense' ? 'هزینه' : item.direction === 'in' ? 'ورود' : 'خروج'}
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
            {['تاریخ', 'عنوان', 'نوع', 'جهت', 'مبلغ', ''].map((h) => (
              <th key={h || 'a'} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
                پرداختی ثبت نشده
              </td>
            </tr>
          ) : (
            rows.map((p) => (
              <tr key={p.id} className="table-row">
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {p.paid_at}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text)' }}>
                  {p.title || p.type}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {p.type}
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${p.direction === 'in' ? 'badge-success' : 'badge-danger'}`}>
                    {p.direction === 'in' ? 'ورود' : 'خروج'}
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
                  {e.spent_at}
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
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
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
            paid_at: paidAt,
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
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>تاریخ</label>
            <input className="input-field" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
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
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await onSave({ category, title, amount: Number(amount) || 0, spent_at: spentAt });
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
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>تاریخ</label>
            <input className="input-field" type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
          </div>
        </div>
        <div className="px-5 py-4 flex flex-row-reverse gap-2" style={{ background: 'var(--bg-muted)' }}>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? '...' : 'ثبت'}</button>
          <button type="button" className="btn-outline" onClick={onClose}>انصراف</button>
        </div>
      </form>
    </div>
  );
}
