import { useEffect, useMemo, useState } from 'react';
import { Search, MessageSquare } from 'lucide-react';
import { getSmsLogs, normalizeSmsStatus, type SmsLog, type SmsStatus } from '../services/smsService';

const statusConfig: Record<
  SmsStatus,
  { label: string; className: string }
> = {
  sent: { label: 'ارسال شده', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  mock: { label: 'شبیه‌سازی', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  failed: { label: 'ناموفق', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fa-IR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

export default function SmsLogs() {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      const { data, error: err } = await getSmsLogs();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLogs([]);
      } else {
        setLogs(data || []);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (log) =>
        (log.name || '').toLowerCase().includes(q) ||
        log.phone.includes(search.trim()) ||
        log.message.toLowerCase().includes(q)
    );
  }, [logs, search]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gold-500/10 flex items-center justify-center">
            <MessageSquare size={20} className="text-gold-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">پیام‌های ارسال شده</h1>
            <p className="text-xs text-gray-500 mt-0.5">تاریخچه پیامک‌های سیستم</p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          className="input-dark pr-10"
          placeholder="جستجو بر اساس نام یا تلفن..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="glass-card p-4 overflow-x-auto">
        {loading ? (
          <TableSkeleton />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {search.trim() ? 'نتیجه‌ای برای جستجو یافت نشد' : 'هنوز پیامکی ثبت نشده است'}
            </p>
          </div>
        ) : (
          <table className="w-full text-right min-w-[720px]">
            <thead>
              <tr className="text-gray-400 text-sm border-b border-gold-500/10">
                <th className="pb-3 px-2">نام</th>
                <th className="pb-3 px-2">تلفن</th>
                <th className="pb-3 px-2 min-w-[200px]">متن پیام</th>
                <th className="pb-3 px-2">وضعیت</th>
                <th className="pb-3 px-2">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => {
                const status = normalizeSmsStatus(log.status);
                const cfg = statusConfig[status];
                return (
                  <tr key={log.id} className="border-t border-white/10 table-row">
                    <td className="py-3 px-2 text-white text-sm">{log.name || '—'}</td>
                    <td className="py-3 px-2 text-gray-300 text-sm font-mono" dir="ltr">
                      {log.phone}
                    </td>
                    <td className="py-3 px-2 text-gray-400 text-sm">
                      <p className="line-clamp-2 leading-relaxed">{log.message}</p>
                    </td>
                    <td className="py-3 px-2">
                      <span
                        className={`inline-flex text-xs px-2.5 py-1 rounded-full border ${cfg.className}`}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-gray-600 text-left">
          {filtered.length.toLocaleString('fa-IR')} مورد
          {search.trim() ? ` از ${logs.length.toLocaleString('fa-IR')}` : ''}
        </p>
      )}
    </div>
  );
}
