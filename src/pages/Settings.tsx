import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyUpdate,
  checkUpdates,
  downloadFullBackup,
  downloadSqlBackup,
  getBackupStats,
  getSystemVersion,
  restoreBackup,
  type BackupPayload,
  type BackupStats,
  type SystemVersion,
  type UpdateCheck,
} from '../services/systemService';
import {
  Settings as SettingsIcon,
  RefreshCcw,
  Download,
  Shield,
  Info,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Database,
  Upload,
  HardDrive,
} from 'lucide-react';

export default function Settings() {
  const [version, setVersion] = useState<SystemVersion | null>(null);
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [log, setLog] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [v, u, s] = await Promise.all([getSystemVersion(), checkUpdates(), getBackupStats()]);
    if (v.data) setVersion(v.data);
    if (u.data) setUpdate(u.data);
    if (s.data) setStats(s.data);
    if (v.error) setError(v.error.message);
    if (u.error) setError(u.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onCheck = async () => {
    setChecking(true);
    setError('');
    const u = await checkUpdates();
    if (u.data) setUpdate(u.data);
    if (u.error) setError(u.error.message);
    setChecking(false);
  };

  const onApply = async () => {
    if (!confirm('نسخه جدید از GitHub روی سرور نصب شود؟ سرویس ممکن است چند دقیقه قطع شود.')) return;
    setApplying(true);
    setLog('');
    setError('');
    const r = await applyUpdate();
    if (r.error) setError(r.error.message);
    if (r.data) {
      setLog([r.data.message, r.data.stdout, r.data.stderr].filter(Boolean).join('\n\n'));
      await load();
    }
    setApplying(false);
  };

  const onBackupFull = async () => {
    setBackingUp(true);
    setError('');
    setSuccess('');
    const r = await downloadFullBackup();
    if (r.error) setError(r.error.message);
    else {
      const tables = r.data?.tables || {};
      const total = Object.values(tables).reduce((a, b) => a + (Number(b) || 0), 0);
      setSuccess(
        `پشتیبان کامل دانلود شد — ${total} رکورد در ${Object.keys(tables).length} جدول + ${r.data?.photo_count || 0} عکس + داده‌های مرورگر`,
      );
    }
    setBackingUp(false);
  };

  const onBackupSql = () => {
    downloadSqlBackup();
    setSuccess('فایل SQL در حال دانلود است');
  };

  const onRestoreFile = async (file: File) => {
    if (!confirm('با بازگردانی، داده‌های فعلی سرور جایگزین می‌شود. ادامه می‌دهید؟')) return;
    setRestoring(true);
    setError('');
    setSuccess('');
    try {
      const text = await file.text();
      let payload: BackupPayload | { sql: string; photos?: Record<string, string>; local?: Record<string, string> };

      if (file.name.endsWith('.sql') || text.trim().startsWith('--') || text.includes('BEGIN TRANSACTION')) {
        payload = { sql: text };
      } else {
        payload = JSON.parse(text) as BackupPayload;
        if (!payload.sql) throw new Error('فایل JSON باید فیلد sql داشته باشد');
      }

      const r = await restoreBackup(payload);
      if (r.error) setError(r.error.message);
      else {
        const after = r.data?.tables_after || {};
        const lines = Object.entries(after).map(([k, v]) => `${k}: ${v}`);
        setSuccess(
          `${r.data?.message || 'بازگردانی شد'} — عکس‌ها: ${r.data?.photos_restored ?? 0}\n${lines.join(' · ')}`,
        );
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خواندن فایل ناموفق بود');
    }
    setRestoring(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const tableEntries = stats?.tables ? Object.entries(stats.tables) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">تنظیمات پنل</h1>
        <p className="page-subtitle">نسخه سیستم، پشتیبان‌گیری کامل و به‌روزرسانی</p>
      </div>

      {error && (
        <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-xl text-sm whitespace-pre-wrap" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
          {success}
        </div>
      )}

      {/* ── Backup / Restore ── */}
      <div className="panel-card p-5 space-y-4">
        <h3 className="section-title flex items-center gap-2">
          <HardDrive size={16} style={{ color: 'var(--accent)' }} />
          پشتیبان‌گیری و بازگردانی سیستم
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          خروجی کامل شامل همه جداول SQLite (اعضا، مربیان، حضور، پیامک، فیش، پرداخت، هزینه)، عکس‌های آپلود‌شده و داده‌های محلی مرورگر است.
        </p>

        {loading ? (
          <div className="h-12 skeleton" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tableEntries.map(([name, count]) => (
              <div key={name} className="p-3 rounded-xl" style={{ background: 'var(--bg-muted)' }}>
                <p className="text-[10px] font-medium truncate" style={{ color: 'var(--text-muted)' }} dir="ltr">
                  {name}
                </p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                  {count}
                </p>
              </div>
            ))}
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg-muted)' }}>
              <p className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                عکس‌ها
              </p>
              <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                {stats?.photo_count ?? 0}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={onBackupFull} disabled={backingUp}>
            <Database size={16} />
            {backingUp ? 'در حال ساخت…' : 'دانلود پشتیبان کامل (JSON)'}
          </button>
          <button type="button" className="btn-outline" onClick={onBackupSql}>
            <Download size={16} />
            فقط SQL
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => fileRef.current?.click()}
            disabled={restoring}
          >
            <Upload size={16} />
            {restoring ? 'در حال بازگردانی…' : 'بازگردانی از فایل'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.sql,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onRestoreFile(f);
            }}
          />
        </div>

        <div className="p-3 rounded-xl text-xs space-y-1" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
          <p className="font-medium flex items-center gap-1" style={{ color: 'var(--text)' }}>
            <Shield size={12} /> نکات امنیتی
          </p>
          <ul className="list-disc pr-4 space-y-0.5">
            <li>فایل JSON کامل را در جای امن نگه دارید (شامل عکس‌ها به صورت base64).</li>
            <li>بازگردانی داده‌های فعلی سرور را جایگزین می‌کند — قبلش یک پشتیبان تازه بگیرید.</li>
            <li>می‌توانید فقط فایل .sql را هم بازگردانی کنید (بدون عکس).</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel-card p-5 space-y-3">
          <h3 className="section-title flex items-center gap-2">
            <Info size={16} style={{ color: 'var(--accent)' }} />
            نسخه فعلی
          </h3>
          {loading ? (
            <div className="h-16 skeleton" />
          ) : (
            <>
              <p className="text-3xl font-extrabold" style={{ color: 'var(--text)' }}>
                v{version?.version || '—'}
              </p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {version?.app || 'Alpha GYM'}
              </p>
              <div className="text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
                <p>Node: {version?.node || '—'}</p>
                <p>محیط: {version?.env || '—'}</p>
              </div>
            </>
          )}
        </div>

        <div className="panel-card p-5 space-y-3">
          <h3 className="section-title flex items-center gap-2">
            <RefreshCcw size={16} style={{ color: 'var(--accent)' }} />
            وضعیت به‌روزرسانی
          </h3>
          {loading ? (
            <div className="h-16 skeleton" />
          ) : update?.update_available ? (
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
              <div>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>
                  نسخه جدید: v{update.remote_version}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {update.commit_message || update.release_name || update.note}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
              <div>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>به‌روز هستید</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {update?.note}
                </p>
              </div>
            </div>
          )}
          {update?.commit_sha && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }} dir="ltr">
              آخرین کامیت GitHub: {update.commit_sha}
              {update.commit_url && (
                <a href={update.commit_url} target="_blank" rel="noreferrer" className="inline-flex mr-1" style={{ color: 'var(--accent)' }}>
                  <ExternalLink size={12} />
                </a>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="panel-card p-5 space-y-4">
        <h3 className="section-title flex items-center gap-2">
          <Download size={16} style={{ color: 'var(--accent)' }} />
          نصب به‌روزرسانی از GitHub
        </h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" onClick={onCheck} disabled={checking}>
            <RefreshCcw size={16} />
            {checking ? 'در حال بررسی...' : 'بررسی نسخه جدید'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onApply}
            disabled={applying || version?.self_update_enabled === false}
          >
            <Download size={16} />
            {applying ? 'در حال نصب...' : 'نصب نسخه جدید روی سرور'}
          </button>
        </div>
        {version && !version.self_update_enabled && (
          <p className="text-xs" style={{ color: 'var(--warning)' }}>
            به‌روزرسانی خودکار غیرفعال است. ENABLE_SELF_UPDATE=true روی سرور
          </p>
        )}
        {log && (
          <pre
            className="text-[11px] p-3 rounded-xl overflow-auto max-h-48"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)', direction: 'ltr', textAlign: 'left' }}
          >
            {log}
          </pre>
        )}
      </div>

      <div className="panel-card p-5">
        <h3 className="section-title flex items-center gap-2 mb-2">
          <SettingsIcon size={16} style={{ color: 'var(--accent)' }} />
          سایر
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          تم روشن/تاریک از آیکون خورشید/ماه بالای صفحه قابل تغییر است.
        </p>
      </div>
    </div>
  );
}
