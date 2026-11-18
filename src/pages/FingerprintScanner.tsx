import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Clock3, Fingerprint, RefreshCw, Users, Wifi } from 'lucide-react';
import { apiGet } from '../services/api';

type ScannerStats = { total_members: number; today_scans: number; today_people: number; active_members: number; expired_members: number; pending_enrollments: number; online_devices: number };
type ScanMember = { name?: string | null; phone?: string | null; member_code?: string | null; expiry_date?: string | null; total_sessions?: number | null; used_sessions?: number | null; sports?: Array<{ sport?: string | null }> };
type ScanRow = { id: number; member_name?: string | null; member_code?: string | null; sport?: string | null; credential_kind?: string | null; device_id?: string | null; device_name?: string | null; scan_type?: string | null; direction?: string | null; scan_time?: string | null; member?: ScanMember | null };
type ReportSummary = { total_scans: number; check_ins: number; check_outs: number; unique_members: number };

function todayIso() { return new Date().toISOString().slice(0, 10); }
function formatDate(value?: string | null) { if (!value) return '—'; return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
function kindLabel(kind?: string | null) { if (kind === 'finger') return 'اثر انگشت'; if (kind === 'card') return 'کارت'; return kind || 'اسکنر'; }
function directionLabel(direction?: string | null) { return direction === 'check_out' ? 'خروج' : 'ورود'; }

export default function FingerprintScanner() {
  const [stats, setStats] = useState<ScannerStats | null>(null);
  const [reportRows, setReportRows] = useState<ScanRow[]>([]);
  const [latest, setLatest] = useState<ScanRow | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [reportDate, setReportDate] = useState(todayIso);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const [statsResult, reportResult] = await Promise.all([
      apiGet<ScannerStats>('/attendance/stats'),
      apiGet<{ date: string; summary: ReportSummary; rows: ScanRow[] }>(`/attendance/report/daily?date=${encodeURIComponent(reportDate)}`),
    ]);
    if (statsResult.error || reportResult.error) setError(statsResult.error || reportResult.error || 'دریافت گزارش اسکنر ناموفق بود');
    else {
      setError('');
      setStats(statsResult.data || null);
      const rows = reportResult.data?.rows || [];
      setReportRows(rows);
      setSummary(reportResult.data?.summary || null);
      setLatest(rows[rows.length - 1] || null);
    }
    setLoading(false); setRefreshing(false);
  }, [reportDate]);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(true), 5000); return () => window.clearInterval(timer); }, [load]);

  const online = Number(stats?.online_devices || 0) > 0;
  const member = latest?.member;
  const total = Number(member?.total_sessions || 0);
  const used = Number(member?.used_sessions || 0);
  const reportTitle = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'full' }).format(new Date(`${reportDate}T12:00:00`));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex items-center gap-3"><Fingerprint size={28} style={{ color: 'var(--accent)' }} /><h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>اسکنر اثر انگشت</h1></div><p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>وضعیت Agent و گزارش ورود و خروج اعضا</p></div>
        <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => void load()} disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> به‌روزرسانی</button>
      </div>
      {error && <div className="panel-card p-4 flex items-center gap-2 text-sm" style={{ color: 'var(--danger)' }}><AlertCircle size={18} /> {error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="panel-card p-5"><div className="flex items-center justify-between"><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>وضعیت Agent</span><Wifi size={20} style={{ color: online ? 'var(--success)' : 'var(--danger)' }} /></div><p className="text-xl font-bold mt-3" style={{ color: online ? 'var(--success)' : 'var(--danger)' }}>{loading ? 'در حال بررسی…' : online ? 'متصل' : 'در انتظار اتصال'}</p></div>
        <div className="panel-card p-5"><div className="flex items-center justify-between"><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>تردد امروز</span><Clock3 size={20} style={{ color: 'var(--accent)' }} /></div><p className="text-2xl font-bold mt-3" style={{ color: 'var(--text)' }}>{stats?.today_scans?.toLocaleString('fa-IR') || '۰'}</p></div>
        <div className="panel-card p-5"><div className="flex items-center justify-between"><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>اعضای حاضر امروز</span><Users size={20} style={{ color: 'var(--accent)' }} /></div><p className="text-2xl font-bold mt-3" style={{ color: 'var(--text)' }}>{stats?.today_people?.toLocaleString('fa-IR') || '۰'}</p></div>
        <div className="panel-card p-5"><div className="flex items-center justify-between"><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>ثبت‌های در انتظار</span><Fingerprint size={20} style={{ color: 'var(--accent)' }} /></div><p className="text-2xl font-bold mt-3" style={{ color: 'var(--text)' }}>{stats?.pending_enrollments?.toLocaleString('fa-IR') || '۰'}</p></div>
      </div>
      <div className="panel-card p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="font-bold" style={{ color: 'var(--text)' }}>گزارش روزانه ورود و خروج</h2><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{reportTitle}</p></div><label className="text-sm" style={{ color: 'var(--text-secondary)' }}>انتخاب تاریخ<input type="date" className="input-field mt-1" value={reportDate} onChange={(e) => setReportDate(e.target.value || todayIso())} /></label></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><div className="rounded-xl p-3" style={{ background: 'var(--bg-muted)' }}><p className="text-xs" style={{ color: 'var(--text-muted)' }}>کل ثبت‌ها</p><p className="text-xl font-bold mt-1" style={{ color: 'var(--text)' }}>{summary?.total_scans?.toLocaleString('fa-IR') || '۰'}</p></div><div className="rounded-xl p-3" style={{ background: 'var(--bg-muted)' }}><p className="text-xs" style={{ color: 'var(--text-muted)' }}>ورود</p><p className="text-xl font-bold mt-1" style={{ color: 'var(--success)' }}>{summary?.check_ins?.toLocaleString('fa-IR') || '۰'}</p></div><div className="rounded-xl p-3" style={{ background: 'var(--bg-muted)' }}><p className="text-xs" style={{ color: 'var(--text-muted)' }}>خروج</p><p className="text-xl font-bold mt-1" style={{ color: 'var(--warning)' }}>{summary?.check_outs?.toLocaleString('fa-IR') || '۰'}</p></div><div className="rounded-xl p-3" style={{ background: 'var(--bg-muted)' }}><p className="text-xs" style={{ color: 'var(--text-muted)' }}>اعضای یکتا</p><p className="text-xl font-bold mt-1" style={{ color: 'var(--accent)' }}>{summary?.unique_members?.toLocaleString('fa-IR') || '۰'}</p></div></div></div>
      {member && <div className="panel-card p-5" style={{ borderColor: 'var(--accent)' }}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>آخرین عضو گزارش</p><h2 className="text-xl font-bold mt-1" style={{ color: 'var(--text)' }}>{member.name || latest?.member_name || 'عضو'}</h2><p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{member.phone || 'تلفن ثبت نشده'} · کد عضویت: {member.member_code || latest?.member_code || '—'}</p></div><span className={`badge ${latest?.direction === 'check_out' ? 'badge-warning' : 'badge-success'}`}>{directionLabel(latest?.direction)} · {formatDate(latest?.scan_time)}</span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>رشته‌ها</p><p className="text-sm mt-1" style={{ color: 'var(--text)' }}>{member.sports?.map((s) => s.sport).filter(Boolean).join('، ') || latest?.sport || '—'}</p></div><div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>کل جلسات</p><p className="text-lg font-bold mt-1" style={{ color: 'var(--text)' }}>{total.toLocaleString('fa-IR')}</p></div><div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>جلسات مصرف‌شده</p><p className="text-lg font-bold mt-1" style={{ color: 'var(--text)' }}>{used.toLocaleString('fa-IR')}</p></div><div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>جلسات باقی‌مانده</p><p className="text-lg font-bold mt-1" style={{ color: 'var(--accent)' }}>{Math.max(0, total - used).toLocaleString('fa-IR')}</p></div></div><p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>تاریخ انقضا: {member.expiry_date || '—'} · نوع ثبت: {kindLabel(latest?.credential_kind || latest?.scan_type)}</p></div>}
      <div className="panel-card overflow-hidden"><div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}><div><h2 className="font-bold" style={{ color: 'var(--text)' }}>جزئیات گزارش روزانه</h2><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>ورود جلسه را کسر می‌کند؛ خروج جلسه را کسر نمی‌کند</p></div><span className="badge badge-success">به‌روزرسانی خودکار</span></div>{loading ? <p className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>در حال دریافت گزارش…</p> : reportRows.length === 0 ? <p className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>برای این تاریخ ترددی ثبت نشده است.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[900px]"><thead><tr style={{ background: 'var(--bg-muted)' }}>{['عضو', 'کد عضویت', 'جهت', 'نوع ثبت', 'رشته', 'دستگاه', 'زمان'].map((h) => <th key={h} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead><tbody>{reportRows.map((row) => <tr key={row.id} className="table-row"><td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text)' }}>{row.member_name || 'ناشناخته'}</td><td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{row.member_code || '—'}</td><td className="px-4 py-3 text-xs font-bold" style={{ color: row.direction === 'check_out' ? 'var(--warning)' : 'var(--success)' }}>{directionLabel(row.direction)}</td><td className="px-4 py-3 text-xs" style={{ color: 'var(--accent)' }}>{kindLabel(row.credential_kind || row.scan_type)}</td><td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{row.sport || '—'}</td><td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{row.device_name || row.device_id || '—'}</td><td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(row.scan_time)}</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
}
