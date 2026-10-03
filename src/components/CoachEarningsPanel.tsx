import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users2, TrendingUp, Wallet, Receipt, AlertTriangle, CheckCircle2, X, Plus, Trash2,
  Download, ChevronDown, ChevronRight, Clock, CalendarDays, Banknote, Percent, PieChart,
  RefreshCw, Users, HandCoins,
} from 'lucide-react';
import {
  getCoachProfitability, getSportProfitability, getCoachEarningsDetail, getSettlePreview,
  settleCoach, settleAllCoaches, cancelSettlement, getSettlements, getSettlement,
  getAdjustments, addAdjustment, deleteAdjustment, getForecast, getCoachesForSport, setSessionSplits,
  fmt, payModelLabels, adjustmentLabels, sourceTypeLabels, settlementStatus,
  type ProfitabilityRow, type SportProfitability, type CoachEarningsDetail,
  type SettlePreview, type Settlement, type SettlementDetail, type Adjustment,
  type AdjustmentKind, type Forecast, type SessionSplit,
} from '../services/coachEarningsService';
import { monthRange, formatToman, type ApiPeriod } from '../services/accountingService';

/* ══════════════════════════════════════════════════════════════
   CoachEarningsPanel — داشبورد موتور سهم مربی (فاز ۱۰ و ۱۱)
   تب‌ها: سودآوری مربیان | ریز سهم یک مربی | سودآوری رشته‌ها | تسویه‌ها
══════════════════════════════════════════════════════════════ */

type Tab = 'profitability' | 'detail' | 'sports' | 'settlements';

const TABS: { key: Tab; label: string; icon: typeof Users2 }[] = [
  { key: 'profitability', label: 'سودآوری مربیان', icon: TrendingUp },
  { key: 'detail',       label: 'ریز سهم مربی',    icon: Wallet },
  { key: 'sports',       label: 'سودآوری رشته‌ها',  icon: PieChart },
  { key: 'settlements',  label: 'تسویه‌ها',         icon: Receipt },
];

export default function CoachEarningsPanel({ period }: { period: ApiPeriod }) {
  const [tab, setTab] = useState<Tab>('profitability');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
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

      {tab === 'profitability' && <ProfitabilityTab period={period} />}
      {tab === 'detail'       && <CoachDetailTab period={period} />}
      {tab === 'sports'       && <SportProfitabilityTab period={period} />}
      {tab === 'settlements'  && <SettlementsTab period={period} />}
    </div>
  );
}

/* ═══════════════ فاز ۱۰ — داشبورد سودآوری مربیان ═══════════════ */

function ProfitabilityTab({ period }: { period: ApiPeriod }) {
  const [rows, setRows] = useState<ProfitabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const r = await getCoachProfitability(period.from, period.to);
    if (r.error) setError(r.error); else setRows(r.data || []);
    setLoading(false);
  }, [period.from, period.to]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.net > 0 || r.sessions > 0);
    return {
      coaches: active.length,
      sessions: active.reduce((s, r) => s + r.sessions, 0),
      revenue: active.reduce((s, r) => s + r.revenue, 0),
      coachPay: active.reduce((s, r) => s + r.gross, 0),
      remaining: active.reduce((s, r) => s + r.remaining, 0),
      overdue: active.filter((r) => settlementStatus(r.remaining).label === 'عقب‌افتاده'),
    };
  }, [rows]);

  if (loading) return <Skeleton rows={5} />;
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (rows.length === 0) return <EmptyState icon={Users2} text="هنوز مربی‌ای ثبت نشده است." />;

  return (
    <div className="space-y-5">
      {/* کارت‌های خلاصه */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="مربیان فعال" value={fmt(totals.coaches)} icon={Users} color="text-gold-400" />
        <StatCard label="جلسات ثبت‌شده" value={fmt(totals.sessions)} icon={CalendarDays} color="text-blue-400" />
        <StatCard label="درآمد کل" value={formatToman(totals.revenue)} icon={TrendingUp} color="text-emerald-400" />
        <StatCard
          label="بدهی تسویه‌نشده"
          value={formatToman(totals.remaining)}
          icon={HandCoins}
          color={totals.overdue.length > 0 ? 'text-red-400' : 'text-amber-400'}
        />
      </div>

      {/* هشدار عقب‌افتادگی */}
      {totals.overdue.length > 0 && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/25 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-medium text-sm">
              {totals.overdue.length} مربی تسویه‌نشده با مانده بالای ۱ میلیون تومان
            </p>
            <p className="text-gray-400 text-xs mt-1">
              {totals.overdue.map((c) => c.name).join('، ')}
            </p>
          </div>
        </div>
      )}

      {/* جدول */}
      <div className="glass-card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gold-500/10">
            <tr className="text-xs text-gray-500">
              <Th>مربی</Th>
              <Th>مدل پرداخت</Th>
              <Th align="center">جلسات</Th>
              <Th align="center">درآمد</Th>
              <Th align="center">سهم مربی</Th>
              <Th align="center">کسورات</Th>
              <Th align="center">خالص</Th>
              <Th align="center">تسویه‌شده</Th>
              <Th align="center">مانده</Th>
              <Th align="center">وضعیت</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = settlementStatus(r.remaining);
              const isOpen = selected === r.id;
              return (
                <>
                  <tr
                    key={r.id}
                    onClick={() => setSelected(isOpen ? null : r.id)}
                    className="table-row cursor-pointer"
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                          <ChevronRight size={14} className="text-gray-500" />
                        </span>
                        <div>
                          <p className="text-white text-sm font-medium">{r.name}</p>
                          <p className="text-gray-500 text-xs">
                            {r.sports.length ? r.sports.join('، ') : 'بدون رشته'}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-xs text-gray-400">{payModelLabels[r.pay_model]}</span>
                      {r.can_private && (
                        <span className="block text-[10px] text-gold-500/70">خصوصی ✓</span>
                      )}
                    </Td>
                    <Td align="center"><span className="text-sm text-blue-300">{fmt(r.sessions)}</span></Td>
                    <Td align="center"><span className="text-sm text-emerald-400">{formatToman(r.revenue)}</span></Td>
                    <Td align="center"><span className="text-sm text-gold-400 font-semibold">{formatToman(r.gross)}</span></Td>
                    <Td align="center">
                      <span className={`text-sm ${r.deductions > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                        {r.deductions > 0 ? formatToman(r.deductions) : '—'}
                      </span>
                    </Td>
                    <Td align="center"><span className="text-sm text-white font-semibold">{formatToman(r.net)}</span></Td>
                    <Td align="center"><span className="text-sm text-gray-400">{formatToman(r.settled)}</span></Td>
                    <Td align="center">
                      <span className={`text-sm font-bold ${r.remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {r.remaining > 0 ? formatToman(r.remaining) : '—'}
                      </span>
                    </Td>
                    <Td align="center">
                      <span className={`text-xs ${st.color}`}>{st.label}</span>
                    </Td>
                  </tr>
                  {isOpen && (
                    <tr key={`${r.id}-detail`}>
                      <td colSpan={10} className="bg-black/30 px-4 py-4">
                        <CoachDetailCard coachId={r.id} period={period} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── کارت بازشونده: پیش‌بینی + کسورات + تسویه ── */

function CoachDetailCard({ coachId, period }: { coachId: number; period: ApiPeriod }) {
  const [detail, setDetail] = useState<CoachEarningsDetail | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [preview, setPreview] = useState<SettlePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [adjOpen, setAdjOpen] = useState(false);

  const periodStr = period.from.slice(0, 7);

  const load = useCallback(async () => {
    setLoading(true); setMsg(null);
    const [d, f, p] = await Promise.all([
      getCoachEarningsDetail(coachId, period.from, period.to),
      getForecast(coachId, periodStr),
      getSettlePreview(coachId, periodStr),
    ]);
    setDetail(d.data); setForecast(f.data); setPreview(p.data);
    setLoading(false);
  }, [coachId, period.from, period.to, periodStr]);

  useEffect(() => { load(); }, [load]);

  const doSettle = async () => {
    if (!preview || preview.net <= 0) return;
    setBusy(true); setMsg(null);
    const r = await settleCoach(coachId, { period: periodStr });
    if (r.error) setMsg({ text: r.error, ok: false });
    else {
      setMsg({ text: `تسویه ${fmt(r.data?.net)} تومان انجام شد`, ok: true });
      await load();
    }
    setBusy(false);
  };

  if (loading) return <div className="h-24 animate-pulse bg-white/5 rounded-lg" />;
  if (!detail) return <ErrorBox error="جزئیات بارگذاری نشد" onRetry={load} />;

  const s = detail.summary;

  return (
    <div className="space-y-4" dir="rtl">
      {/* خلاصه مالی */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="سهم جلسات" value={formatToman(s.session_total)} tone="text-gold-400" />
        <MiniStat label="حقوق ثابت" value={s.salary_total > 0 ? formatToman(s.salary_total) : '—'} tone="text-blue-400" />
        <MiniStat label="پاداش" value={s.adjustments_bonus > 0 ? formatToman(s.adjustments_bonus) : '—'} tone="text-emerald-400" />
        <MiniStat label="کسورات" value={s.deductions > 0 ? formatToman(s.deductions) : '—'} tone="text-red-400" />
      </div>

      {/* تسویه */}
      <div className="p-4 rounded-xl bg-gold-500/5 border border-gold-500/20 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <Banknote size={16} className="text-gold-400" />
            تسویه دوره {periodStr}
          </h4>
          <button
            onClick={doSettle}
            disabled={busy || !preview || preview.net <= 0}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'در حال ثبت...' : `تسویه ${preview ? fmt(preview.net) : 0} تومان`}
          </button>
        </div>

        {preview && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <PreviewCell label="آیتم" value={`${fmt(preview.item_count)} مورد`} />
            <PreviewCell label="ناخالص" value={formatToman(preview.gross)} />
            <PreviewCell label="حقوق معلق" value={preview.salary_pending > 0 ? formatToman(preview.salary_pending) : '—'} />
            <PreviewCell label="پاداش" value={preview.bonuses > 0 ? formatToman(preview.bonuses) : '—'} />
            <PreviewCell label="کسورات" value={preview.deductions > 0 ? formatToman(preview.deductions) : '—'} />
          </div>
        )}

        {msg && (
          <p className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
        )}
      </div>

      {/* پیش‌بینی */}
      {forecast && forecast.session_total > 0 && (
        <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-center gap-4 text-xs">
          <Clock size={16} className="text-blue-400 shrink-0" />
          <span className="text-gray-400">
            روز {fmt(forecast.days_passed)} از {fmt(forecast.days_in_month)} —
            میانگین {fmt(forecast.per_day)} تومان در روز
          </span>
          <span className="text-blue-300 font-medium mr-auto">
            پیش‌بینی پایان ماه: {formatToman(forecast.projected_sessions)}
          </span>
        </div>
      )}

      {/* کسورات و پاداش */}
      <div>
        <button
          onClick={() => setAdjOpen(!adjOpen)}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-gold-400 transition-colors"
        >
          <ChevronDown size={14} className={`transition-transform ${adjOpen ? '' : '-rotate-90'}`} />
          کسورات و پاداش ({detail.adjustments.length})
        </button>
        {adjOpen && (
          <AdjustmentsPanel
            coachId={coachId}
            period={periodStr}
            items={detail.adjustments}
            onChanged={load}
          />
        )}
      </div>

      {/* ریز سهم‌ها */}
      <div className="max-h-64 overflow-y-auto space-y-1">
        {detail.earnings.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">سهمی برای این دوره ثبت نشده است.</p>
        ) : (
          detail.earnings.map((e) => (
            <div key={e.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`px-1.5 py-0.5 rounded ${e.source_type === 'salary' ? 'bg-blue-500/20 text-blue-300' : 'bg-gold-500/15 text-gold-400'}`}>
                  {sourceTypeLabels[e.source_type] || e.source_type}
                </span>
                <span className="text-gray-300 truncate">{e.member_name || e.note || '—'}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-gray-500">{e.earned_at}</span>
                <span className="text-gold-400 font-medium">{formatToman(e.net)}</span>
                {e.settlement_id ? (
                  <CheckCircle2 size={13} className="text-emerald-400" title="تسویه‌شده" />
                ) : (
                  <span className="text-amber-500/70 text-[10px]">تسویه نشده</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PreviewCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 bg-black/20 rounded-lg">
      <p className="text-gray-500 text-[10px]">{label}</p>
      <p className="text-white text-xs mt-0.5">{value}</p>
    </div>
  );
}

/* ── کسورات و پاداش ── */

function AdjustmentsPanel({
  coachId, period, items, onChanged,
}: { coachId: number; period: string; items: Adjustment[]; onChanged: () => void }) {
  const [kind, setKind] = useState<AdjustmentKind>('deduction');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    const amt = Number(amount.replace(/[^\d]/g, ''));
    if (!amt || amt <= 0) { setErr('مبلغ را وارد کنید'); return; }
    setBusy(true);
    const r = await addAdjustment(coachId, { period, kind, amount: amt, reason: reason.trim() || undefined });
    if (r.error) setErr(r.error);
    else { setAmount(''); setReason(''); onChanged(); }
    setBusy(false);
  };

  const remove = async (id: number) => {
    await deleteAdjustment(id);
    onChanged();
  };

  return (
    <div className="mt-2 p-4 rounded-xl bg-black/20 space-y-3">
      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-xs">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded ${a.kind === 'bonus' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                  {adjustmentLabels[a.kind]}
                </span>
                <span className="text-gray-400">{a.reason || 'بدون دلیل'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={a.kind === 'bonus' ? 'text-emerald-400' : 'text-red-400'}>
                  {a.kind === 'bonus' ? '+' : '−'} {formatToman(a.amount)}
                </span>
                <button onClick={() => remove(a.id)} className="text-gray-500 hover:text-red-400">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[120px]">
          <label className="text-[10px] text-gray-500 block mb-1">نوع</label>
          <select className="input-dark" value={kind} onChange={(e) => setKind(e.target.value as AdjustmentKind)}>
            <option value="deduction">کسورات (جریمه، مساعده)</option>
            <option value="bonus">پاداش</option>
          </select>
        </div>
        <div className="flex-1 min-w-[110px]">
          <label className="text-[10px] text-gray-500 block mb-1">مبلغ (تومان)</label>
          <input className="input-dark" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="۵۰۰۰۰۰" inputMode="numeric" dir="ltr" />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="text-[10px] text-gray-500 block mb-1">دلیل</label>
          <input className="input-dark" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="جریمه ۳ جلسه لغوشده" />
        </div>
        <button type="submit" disabled={busy}
          className="px-3 py-2 rounded-lg text-xs bg-gold-500/15 text-gold-400 border border-gold-500/30 hover:bg-gold-500/25 disabled:opacity-40">
          <Plus size={14} />
        </button>
      </form>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

/* ── تب ریز سهم یک مربی ── */

function CoachDetailTab({ period }: { period: ApiPeriod }) {
  const [rows, setRows] = useState<ProfitabilityRow[]>([]);
  const [coachId, setCoachId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CoachEarningsDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [onlyUnsettled, setOnlyUnsettled] = useState(false);

  useEffect(() => {
    getCoachProfitability(period.from, period.to).then((r) => setRows(r.data || []));
  }, [period.from, period.to]);

  useEffect(() => {
    if (coachId == null) { setDetail(null); return; }
    setLoading(true);
    getCoachEarningsDetail(coachId, period.from, period.to, { onlyUnsettled })
      .then((r) => setDetail(r.data))
      .finally(() => setLoading(false));
  }, [coachId, period.from, period.to, onlyUnsettled]);

  return (
    <div className="space-y-4">
      <div className="glass-card p-4">
        <label className="text-xs text-gray-400 block mb-2">انتخاب مربی</label>
        <select className="input-dark max-w-md" value={coachId ?? ''} onChange={(e) => setCoachId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— انتخاب کنید —</option>
          {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {loading && <Skeleton rows={4} />}
      {!loading && !detail && <EmptyState icon={Wallet} text="مربی را انتخاب کنید تا ریز سهم‌ها نمایش داده شود." />}

      {detail && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MiniStat label="سهم جلسات" value={formatToman(detail.summary.session_total)} tone="text-gold-400" />
            <MiniStat label="حقوق" value={detail.summary.salary_total ? formatToman(detail.summary.salary_total) : '—'} tone="text-blue-400" />
            <MiniStat label="خالص" value={formatToman(detail.summary.net)} tone="text-white" />
            <MiniStat label="تسویه‌شده" value={formatToman(detail.summary.settled)} tone="text-emerald-400" />
            <MiniStat label="مانده" value={formatToman(detail.summary.remaining)} tone={detail.summary.remaining > 0 ? 'text-amber-400' : 'text-gray-500'} />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={onlyUnsettled} onChange={(e) => setOnlyUnsettled(e.target.checked)}
              className="w-4 h-4 accent-gold-500" />
            فقط سهم‌های تسویه‌نشده
          </label>

          <div className="glass-card overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gold-500/10">
                <tr className="text-xs text-gray-500">
                  <Th>تاریخ</Th><Th>نوع</Th><Th>عضو</Th><Th>رشته</Th>
                  <Th align="center">نرخ واحد</Th><Th align="center">درصد</Th>
                  <Th align="center">سهم</Th><Th align="center">وضعیت</Th>
                </tr>
              </thead>
              <tbody>
                {detail.earnings.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-500 text-sm">آیتمی یافت نشد</td></tr>
                ) : detail.earnings.map((e) => (
                  <tr key={e.id} className="table-row">
                    <Td><span className="text-gray-400 text-xs">{e.earned_at}</span></Td>
                    <Td>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${e.source_type === 'salary' ? 'bg-blue-500/20 text-blue-300' : 'bg-gold-500/15 text-gold-400'}`}>
                        {sourceTypeLabels[e.source_type] || e.source_type}
                      </span>
                    </Td>
                    <Td><span className="text-white text-sm">{e.member_name || '—'}</span></Td>
                    <Td><span className="text-gray-400 text-xs">{e.sport || '—'}</span></Td>
                    <Td align="center"><span className="text-xs text-gray-400">{e.unit_price ? formatToman(e.unit_price) : '—'}</span></Td>
                    <Td align="center">
                      <span className="text-xs text-gold-400">{e.share_percent > 0 ? `${fmt(e.share_percent)}٪` : '—'}</span>
                    </Td>
                    <Td align="center"><span className="text-sm text-white font-semibold">{formatToman(e.net)}</span></Td>
                    <Td align="center">
                      {e.settlement_id
                        ? <span className="text-xs text-emerald-400">تسویه‌شده</span>
                        : <span className="text-xs text-amber-400">در انتظار</span>}
                    </Td>
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

/* ── تب سودآوری رشته‌ها ── */

function SportProfitabilityTab({ period }: { period: ApiPeriod }) {
  const [rows, setRows] = useState<SportProfitability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getSportProfitability(period.from, period.to).then((r) => setRows(r.data || [])).finally(() => setLoading(false));
  }, [period.from, period.to]);

  if (loading) return <Skeleton rows={4} />;
  if (rows.length === 0) return <EmptyState icon={PieChart} text="برای این دوره جلسه‌ای ثبت نشده است." />;

  const maxProfit = Math.max(...rows.map((r) => Math.abs(r.net_profit)), 1);

  return (
    <div className="glass-card overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-gold-500/10">
          <tr className="text-xs text-gray-500">
            <Th>رشته</Th><Th align="center">جلسات</Th><Th align="center">درآمد کل</Th>
            <Th align="center">سهم باشگاه</Th><Th align="center">پرداختی مربیان</Th>
            <Th align="center">سود خالص</Th><Th>نمودار</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sport} className="table-row">
              <Td><span className="text-white text-sm font-medium">{r.sport}</span></Td>
              <Td align="center"><span className="text-sm text-blue-300">{fmt(r.sessions)}</span></Td>
              <Td align="center"><span className="text-sm text-emerald-400">{formatToman(r.revenue)}</span></Td>
              <Td align="center"><span className="text-sm text-gold-400">{formatToman(r.gym_share)}</span></Td>
              <Td align="center"><span className="text-sm text-gray-400">{formatToman(r.coach_paid)}</span></Td>
              <Td align="center">
                <span className={`text-sm font-bold ${r.net_profit > 0 ? 'text-emerald-400' : r.net_profit < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {formatToman(r.net_profit)}
                </span>
              </Td>
              <Td>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden min-w-[80px]">
                    <div
                      className={`h-full rounded-full ${r.net_profit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, (Math.abs(r.net_profit) / maxProfit) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 shrink-0">
                    {((r.gym_share / (r.revenue || 1)) * 100).toFixed(0)}٪ سهم باشگاه
                  </span>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── تب تسویه‌ها (شامل تسویه گروهی) ── */

function SettlementsTab({ period }: { period: ApiPeriod }) {
  const periodStr = period.from.slice(0, 7);
  const [rows, setRows] = useState<Settlement[]>([]);
  const [preview, setPreview] = useState<SettlePreview[]>([]);
  const [detail, setDetail] = useState<SettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getSettlements({ period: periodStr });
    setRows(r.data || []);
    setLoading(false);
  }, [periodStr]);

  useEffect(() => { load(); }, [load]);

  // پیش‌نمایش تسویه گروهی
  const loadPreview = useCallback(async () => {
    const p = await getCoachProfitability(period.from, period.to);
    const coaches = (p.data || []).filter((c) => c.remaining > 0);
    const previews = await Promise.all(coaches.map((c) => getSettlePreview(c.id, periodStr)));
    setPreview(previews.map((x) => x.data).filter(Boolean) as SettlePreview[]);
  }, [period.from, period.to, periodStr]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const settleAll = async () => {
    setBusy(true); setMsg(null);
    const r = await settleAllCoaches({ period: periodStr });
    if (r.error) setMsg({ text: r.error, ok: false });
    else {
      const d = r.data;
      setMsg({ text: `${d?.settled_count} مربی تسویه شد — مجموع ${fmt(d?.total_net)} تومان`, ok: true });
      await load(); await loadPreview();
    }
    setBusy(false);
  };

  const openDetail = async (id: number) => {
    const r = await getSettlement(id);
    setDetail(r.data);
  };

  const doCancel = async (id: number) => {
    const r = await cancelSettlement(id);
    if (r.error) setMsg({ text: r.error, ok: false });
    else { setMsg({ text: 'تسویه لغو و سهم‌ها بازگردانده شد', ok: true }); setDetail(null); await load(); await loadPreview(); }
  };

  const downloadCsv = (id: number) => {
    window.open(`/api/accounting/settlements/${id}/export.csv`, '_blank');
  };

  const totalPending = preview.reduce((s, p) => s + p.net, 0);

  if (loading) return <Skeleton rows={4} />;

  return (
    <div className="space-y-5">
      {/* تسویه گروهی */}
      <div className="p-4 rounded-xl bg-gold-500/5 border border-gold-500/20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Banknote size={16} className="text-gold-400" />
              تسویه گروهی دوره {periodStr}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {preview.length} مربی آماده تسویه — مجموع {formatToman(totalPending)}
            </p>
          </div>
          <button
            onClick={settleAll}
            disabled={busy || preview.length === 0}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'در حال ثبت...' : `تسویه همه (${preview.length})`}
          </button>
        </div>

        {preview.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {preview.map((p) => (
              <div key={p.coach.id} className="p-2.5 bg-black/20 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-white text-xs font-medium">{p.coach.name}</p>
                  <p className="text-gray-500 text-[10px]">{p.item_count} آیتم</p>
                </div>
                <span className="text-gold-400 text-xs font-semibold">{formatToman(p.net)}</span>
              </div>
            ))}
          </div>
        )}

        {msg && <p className={`text-xs mt-3 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
      </div>

      {/* تاریخچه */}
      <div className="glass-card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gold-500/10">
            <tr className="text-xs text-gray-500">
              <Th>مربی</Th><Th>دوره</Th><Th align="center">آیتم</Th>
              <Th align="center">ناخالص</Th><Th align="center">کسورات</Th>
              <Th align="center">خالص</Th><Th>ثبت‌کننده</Th><Th align="center">عملیات</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-gray-500 text-sm">تسویه‌ای ثبت نشده است</td></tr>
            ) : rows.map((s) => (
              <tr key={s.id} className="table-row">
                <Td>
                  <button onClick={() => openDetail(s.id)} className="text-white text-sm font-medium hover:text-gold-400 transition-colors">
                    {s.coach_name}
                  </button>
                </Td>
                <Td><span className="text-gray-400 text-xs">{s.period}</span></Td>
                <Td align="center"><span className="text-xs text-gray-400">{fmt(s.item_count)}</span></Td>
                <Td align="center"><span className="text-xs text-gray-300">{formatToman(s.gross)}</span></Td>
                <Td align="center">
                  <span className={`text-xs ${s.deductions > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                    {s.deductions > 0 ? formatToman(s.deductions) : '—'}
                  </span>
                </Td>
                <Td align="center"><span className="text-sm text-white font-bold">{formatToman(s.net)}</span></Td>
                <Td><span className="text-xs text-gray-500">{s.settled_by || '—'}</span></Td>
                <Td align="center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => downloadCsv(s.id)} title="خروجی CSV"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gold-400 hover:bg-gold-500/10">
                      <Download size={14} />
                    </button>
                    <button onClick={() => doCancel(s.id)} title="لغو تسویه"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* جزئیات تسویه */}
      {detail && (
        <SettlementModal detail={detail} onClose={() => setDetail(null)} onCancel={() => doCancel(detail.settlement.id)} />
      )}
    </div>
  );
}

function SettlementModal({
  detail, onClose, onCancel,
}: { detail: SettlementDetail; onClose: () => void; onCancel: () => void }) {
  const { settlement: s, coach, items, adjustments } = detail;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl glass-card p-6 animate-fade-in"
        style={{ maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-white">جزئیات تسویه — {coach.name}</h3>
            <p className="text-xs text-gray-500 mt-1">
              دوره {s.period} · {s.item_count} آیتم · ثبت توسط {s.settled_by || '—'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <MiniStat label="ناخالص" value={formatToman(s.gross)} tone="text-gold-400" />
          <MiniStat label="کسورات" value={formatToman(s.deductions)} tone="text-red-400" />
          <MiniStat label="خالص" value={formatToman(s.net)} tone="text-emerald-400" />
          <MiniStat label="تعداد" value={fmt(s.item_count)} tone="text-white" />
        </div>

        {adjustments.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs text-gray-400 mb-2">کسورات و پاداش دوره</h4>
            <div className="space-y-1">
              {adjustments.map((a) => (
                <div key={a.id} className="flex justify-between p-2 bg-white/5 rounded-lg text-xs">
                  <span className="text-gray-400">{adjustmentLabels[a.kind]} — {a.reason || 'بدون دلیل'}</span>
                  <span className={a.kind === 'bonus' ? 'text-emerald-400' : 'text-red-400'}>
                    {a.kind === 'bonus' ? '+' : '−'} {formatToman(a.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <h4 className="text-xs text-gray-400 mb-2">ریز جلسات</h4>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {items.map((i) => (
            <div key={i.id} className="flex justify-between p-2 bg-white/5 rounded-lg text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">{i.earned_at}</span>
                <span className="text-gray-300">{i.member_name || i.note}</span>
              </div>
              <div className="flex items-center gap-3">
                {i.share_percent > 0 && <span className="text-gold-500/80">{fmt(i.share_percent)}٪</span>}
                <span className="text-white font-medium">{formatToman(i.net)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-5 pt-4 border-t border-gold-500/10">
          <button onClick={() => window.open(`/api/accounting/settlements/${s.id}/export.csv`, '_blank')}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm bg-gold-500/15 text-gold-400 border border-gold-500/30 hover:bg-gold-500/25 transition-colors flex items-center justify-center gap-2">
            <Download size={15} /> خروجی CSV
          </button>
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-colors">
            لغو تسویه
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ اجزای کوچک ═══════════════ */

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'right' | 'center' }) {
  return <th className={`px-4 py-3 font-medium text-${align} whitespace-nowrap`}>{children}</th>;
}
function Td({ children, align = 'right' }: { children: React.ReactNode; align?: 'right' | 'center' }) {
  return <td className={`p-4 text-${align}`}>{children}</td>;
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: typeof Users; color: string;
}) {
  return (
    <div className="glass-card p-4 text-center">
      <Icon size={20} className={`${color} mx-auto mb-2`} />
      <p className="text-lg font-bold text-white truncate">{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="p-2.5 bg-black/20 rounded-lg">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className={`text-xs font-semibold mt-0.5 ${tone}`}>{value}</p>
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

function ErrorBox({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/25 text-center">
      <AlertTriangle size={24} className="text-red-400 mx-auto mb-2" />
      <p className="text-red-400 text-sm">{error}</p>
      <button onClick={onRetry} className="mt-3 px-3 py-1.5 rounded-lg text-xs bg-red-500/15 border border-red-500/30 text-red-400">
        تلاش دوباره
      </button>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="py-12 text-center">
      <Icon size={40} className="text-gray-700 mx-auto mb-3" />
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}
