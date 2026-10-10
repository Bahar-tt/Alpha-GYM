import { useCallback, useEffect, useState } from 'react';
import {
  applyUpdate,
  checkUpdates,
  getSystemVersion,
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
} from 'lucide-react';

export default function Settings() {
  const [version, setVersion] = useState<SystemVersion | null>(null);
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [log, setLog] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [v, u] = await Promise.all([getSystemVersion(), checkUpdates()]);
    if (v.data) setVersion(v.data);
    if (u.data) setUpdate(u.data);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">تنظیمات پنل</h1>
        <p className="page-subtitle">نسخه سیستم، به‌روزرسانی از GitHub و وضعیت سرور</p>
      </div>

      {error && (
        <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

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

        <div className="p-4 rounded-xl text-sm space-y-2" style={{ background: 'var(--bg-muted)' }}>
          <p className="flex items-center gap-2 font-medium" style={{ color: 'var(--text)' }}>
            <Shield size={14} />
            آیا شدنی است؟
          </p>
          <ul className="text-xs space-y-1 list-disc pr-4" style={{ color: 'var(--text-secondary)' }}>
            <li>بررسی نسخه از GitHub: همیشه ممکن است (API عمومی یا با توکن برای ریپوی خصوصی).</li>
            <li>
              نصب خودکار روی سرور فقط وقتی فعال است که{' '}
              <code dir="ltr">ENABLE_SELF_UPDATE=true</code> باشد و پروژه با git/docker روی همان سرور در دسترس باشد.
            </li>
            <li>
              داخل کانتینر بدون مانت سورس و دسترسی docker، نصب کامل ممکن نیست — در آن حالت از CI/CD یا SSH استفاده کنید.
            </li>
            <li>
              دستور پیش‌فرض:{' '}
              <code dir="ltr" className="text-[10px]">
                git pull && docker compose up -d --build
              </code>
            </li>
          </ul>
        </div>

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
            title={version?.self_update_enabled ? '' : 'ENABLE_SELF_UPDATE روی سرور خاموش است'}
          >
            <Download size={16} />
            {applying ? 'در حال نصب...' : 'نصب نسخه جدید روی سرور'}
          </button>
        </div>

        {version && !version.self_update_enabled && (
          <p className="text-xs" style={{ color: 'var(--warning)' }}>
            به‌روزرسانی خودکار الان غیرفعال است. برای فعال‌سازی در env سرور:{' '}
            <span dir="ltr">ENABLE_SELF_UPDATE=true</span> و در صورت نیاز{' '}
            <span dir="ltr">UPDATE_PROJECT_DIR</span> / <span dir="ltr">GITHUB_TOKEN</span>
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
          تم روشن/تاریک از آیکون خورشید/ماه بالای صفحه قابل تغییر است. اعلان نسخه جدید با زنگوله کنار همان دکمه نمایش داده می‌شود.
        </p>
      </div>
    </div>
  );
}
