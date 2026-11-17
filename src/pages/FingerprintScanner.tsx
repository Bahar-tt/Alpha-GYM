import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Clock3, Fingerprint, RefreshCw, Users, Wifi } from 'lucide-react';
import { apiGet } from '../services/api';

type ScannerStats = {
  total_members: number;
  today_scans: number;
  today_people: number;
  active_members: number;
  expired_members: number;
  pending_enrollments: number;
  online_devices: number;
};

type ScanRow = {
  id: number;
  member_name?: string | null;
  member_code?: string | null;
  sport?: string | null;
  credential_kind?: string | null;
  device_id?: string | null;
  device_name?: string | null;
  scan_type?: string | null;
  scan_time?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function kindLabel(kind?: string | null) {
  if (kind === 'finger') return 'اثر انگشت';
  if (kind === 'card') return 'کارت';
  return kind || 'اسکنر';
}

export default function FingerprintScanner() {
  const [stats, setStats] = useState<ScannerStats | null>(null);
  const [recent, setRecent] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const [statsResult, scansResult] = await Promise.all([
      apiGet<ScannerStats>('/attendance/stats'),
      apiGet<ScanRow[]>('/attendance/recent?limit=50'),
    ]);
    if (statsResult.error || scansResult.error) {
      setError(statsResult.error || scansResult.error || 'دریافت وضعیت اسکنر ناموفق بود');
    } else {
      setError('');
      setStats(statsResult.data || null);
      setRecent(Array.isArray(scansResult.data) ? scansResult.data : []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const online = Number(stats?.online_devices || 0) > 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Fingerprint size={28} style={{ color: 'var(--accent)' }} />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>اسکنر اثر انگشت</h1>
          </div>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            وضعیت اتصال Agent و ثبت ترددهای اعضا به‌صورت لحظه‌ای
          </p>
        </div>
        <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> به‌روزرسانی
        </button>
      </div>

      {error && (
        <div className="panel-card p-4 flex items-center gap-2 text-sm" style={{ color: 'var(--danger)' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="panel-card p-5">
          <div className="flex items-center justify-between"><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>وضعیت Agent</span><Wifi size={20} style={{ color: online ? 'var(--success)' : 'var(--danger)' }} /></div>
          <p className="text-xl font-bold mt-3" style={{ color: online ? 'var(--success)' : 'var(--danger)' }}>{loading ? 'در حال بررسی…' : online ? 'متصل' : 'در انتظار اتصال'}</p>
        </div>
        <div className="panel-card p-5">
          <div className="flex items-center justify-between"><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>تردد امروز</span><Clock3 size={20} style={{ color: 'var(--accent)' }} /></div>
          <p className="text-2xl font-bold mt-3" style={{ color: 'var(--text)' }}>{stats?.today_scans?.toLocaleString('fa-IR') || '۰'}</p>
        </div>
        <div className="panel-card p-5">
          <div className="flex items-center justify-between"><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>اعضای حاضر امروز</span><Users size={20} style={{ color: 'var(--accent)' }} /></div>
          <p className="text-2xl font-bold mt-3" style={{ color: 'var(--text)' }}>{stats?.today_people?.toLocaleString('fa-IR') || '۰'}</p>
        </div>
        <div className="panel-card p-5">
          <div className="flex items-center justify-between"><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>ثبت‌های در انتظار</span><Fingerprint size={20} style={{ color: 'var(--accent)' }} /></div>
          <p className="text-2xl font-bold mt-3" style={{ color: 'var(--text)' }}>{stats?.pending_enrollments?.toLocaleString('fa-IR') || '۰'}</p>
        </div>
      </div>

      <div className="panel-card overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <div><h2 className="font-bold" style={{ color: 'var(--text)' }}>آخرین ترددهای ثبت‌شده</h2><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>اطلاعات مستقیماً از ثبت‌های اسکنر خوانده می‌شود</p></div>
          <span className="badge badge-success">به‌روزرسانی خودکار</span>
        </div>
        {loading ? <p className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>در حال دریافت اطلاعات…</p> : recent.length === 0 ? <p className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>هنوز ترددی ثبت نشده است.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px]"><thead><tr style={{ background: 'var(--bg-muted)' }}>{['عضو', 'کد عضویت', 'نوع ثبت', 'رشته', 'دستگاه', 'زمان'].map((h) => <th key={h} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead><tbody>{recent.map((row) => <tr key={row.id} className="table-row"><td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text)' }}>{row.member_name || 'ناشناخته'}</td><td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{row.member_code || '—'}</td><td className="px-4 py-3 text-xs" style={{ color: 'var(--accent)' }}>{kindLabel(row.credential_kind || row.scan_type)}</td><td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{row.sport || '—'}</td><td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{row.device_name || row.device_id || '—'}</td><td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(row.scan_time)}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </div>
  );
}
