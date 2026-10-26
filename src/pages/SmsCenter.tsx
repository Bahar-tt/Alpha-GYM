import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Send,
  MessageSquare,
  ScrollText,
  Users,
  Search,
  AlertTriangle,
  CheckCircle,
  X,
  Smartphone,
} from 'lucide-react';
import { getMembers, type MemberRecord } from '../services/memberService';
import {
  getSmsLogs,
  sendSms,
  sendBroadcast,
  loadBroadcastDraft,
  saveBroadcastDraft,
  normalizeSmsStatus,
  type SmsLog,
  type SmsStatus,
  type BroadcastReport,
} from '../services/smsService';
import {
  audienceFilterLabels,
  filterMembersByAudience,
  toBroadcastRecipients,
  type AudienceFilter,
} from '../lib/broadcastAudience';
import { useAuth } from '../context/AuthContext';

type TabId = 'send' | 'broadcast' | 'logs';

const TABS: { id: TabId; label: string; icon: typeof Send; adminOnly?: boolean }[] = [
  { id: 'send', label: 'ارسال پیام', icon: Smartphone },
  { id: 'broadcast', label: 'ارسال گروهی', icon: Send, adminOnly: true },
  { id: 'logs', label: 'گزارش پیامک', icon: ScrollText, adminOnly: true },
];

const AUDIENCE_OPTIONS: AudienceFilter[] = [
  'all',
  'active',
  'expiring_7',
  'expiring_14',
  'expired',
  'birthdays_today',
];

const LARGE_BATCH_THRESHOLD = 100;
const SMS_CHAR_SEGMENT = 70;

const statusConfig: Record<SmsStatus, { label: string; className: string }> = {
  sent: { label: 'ارسال شده', className: 'badge-success' },
  mock: { label: 'شبیه‌سازی', className: 'badge-warning' },
  failed: { label: 'ناموفق', className: 'badge-danger' },
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

const TEMPLATES = [
  {
    label: 'یادآوری تمدید',
    body: 'کاربر گرامی، عضویت شما در آلفا جیم در حال انقضا است. لطفاً جهت تمدید اقدام فرمایید.',
  },
  {
    label: 'خوش‌آمدگویی',
    body: 'کاربر گرامی، به خانواده آلفا جیم خوش آمدید. ما آماده‌ایم تا بهترین تجربه ورزشی را برای شما فراهم کنیم.',
  },
  {
    label: 'تخفیف ویژه',
    body: 'کاربر گرامی، به مناسبت ویژه، تخفیفی برای تمدید عضویت شما در نظر گرفته شده است. همین الان اقدام کنید!',
  },
];

export default function SmsCenter() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const initialTab: TabId =
    tabFromUrl && TABS.some((t) => t.id === tabFromUrl)
      ? tabFromUrl
      : 'send';

  const [tab, setTab] = useState<TabId>(initialTab);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ارسال تکی
  const [singleMemberId, setSingleMemberId] = useState('');
  const [singleMessage, setSingleMessage] = useState('');
  const [sendingSingle, setSendingSingle] = useState(false);

  // گروهی
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [audience, setAudience] = useState<AudienceFilter>('active');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [report, setReport] = useState<BroadcastReport | null>(null);

  // گزارش
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logError, setLogError] = useState('');

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const switchTab = (id: TabId) => {
    setTab(id);
    setSearchParams(id === 'send' ? {} : { tab: id });
  };

  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== tab) setTab(tabFromUrl);
  }, [tabFromUrl]);

  useEffect(() => {
    const draft = loadBroadcastDraft();
    if (draft) {
      setBroadcastMsg(draft.message);
      if (AUDIENCE_OPTIONS.includes(draft.audience as AudienceFilter)) {
        setAudience(draft.audience as AudienceFilter);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMembers(true);
      const { data } = await getMembers();
      if (!cancelled) {
        setMembers(data || []);
        setLoadingMembers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    setLogError('');
    const { data, error } = await getSmsLogs();
    if (error) {
      setLogError(error.message);
      setLogs([]);
    } else {
      setLogs(data || []);
    }
    setLoadingLogs(false);
  }, []);

  useEffect(() => {
    if (tab === 'logs') loadLogs();
  }, [tab, loadLogs]);

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  const filteredMembers = useMemo(
    () => filterMembersByAudience(members, audience),
    [members, audience],
  );
  const recipients = useMemo(() => toBroadcastRecipients(filteredMembers), [filteredMembers]);
  const recipientCount = recipients.length;
  const isLargeBatch = recipientCount > LARGE_BATCH_THRESHOLD;
  const charCount = broadcastMsg.length;
  const smsUnits = Math.max(1, Math.ceil(charCount / SMS_CHAR_SEGMENT) || 1);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (log) =>
        (log.name || '').toLowerCase().includes(q) ||
        log.phone.includes(logSearch.trim()) ||
        log.message.toLowerCase().includes(q),
    );
  }, [logs, logSearch]);

  const selectedMember = members.find((m) => m.id === singleMemberId);

  const handleSendSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !singleMessage.trim()) return;
    setSendingSingle(true);
    const { error } = await sendSms({
      member_id: Number(selectedMember.id),
      name: selectedMember.full_name,
      phone: selectedMember.phone,
      message: singleMessage.trim(),
    });
    setSendingSingle(false);
    if (error) {
      showToast('error', error.message);
      return;
    }
    showToast('success', 'پیامک ارسال شد');
    setSingleMessage('');
  };

  const executeBroadcast = async () => {
    setShowConfirm(false);
    setSendingBroadcast(true);
    setReport(null);
    const { data, error } = await sendBroadcast(recipients, broadcastMsg.trim());
    setSendingBroadcast(false);
    if (error) {
      showToast('error', error.message);
      return;
    }
    if (data) {
      setReport(data);
      showToast(
        data.failure_count > 0 ? 'error' : 'success',
        `ارسال: ${data.success_count.toLocaleString('fa-IR')} موفق، ${data.failure_count.toLocaleString('fa-IR')} ناموفق`,
      );
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2 shadow-lg"
          style={{
            background: toast.type === 'success' ? 'var(--success-soft)' : 'var(--danger-soft)',
            color: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${toast.type === 'success' ? 'var(--success)' : 'var(--danger)'}33`,
          }}
        >
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {toast.text}
        </div>
      )}

      <div
      className="page-hero"
      >
        <h1 className="page-title">مرکز پیامک</h1>
        <p className="page-subtitle">ارسال تکی، گروهی و گزارش پیامک‌ها در یک صفحه</p>
      </div>

      {/* تب‌ها */}
      <div
        className="flex flex-wrap gap-1 p-1 rounded-2xl"
        style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
      >
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: active ? 'var(--bg-elevated)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                boxShadow: active ? 'var(--shadow)' : 'none',
              }}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ─── ارسال تکی ─── */}
      {tab === 'send' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleSendSingle} className="lg:col-span-2 panel-card p-6 space-y-4">
            <h2 className="section-title flex items-center gap-2">
              <MessageSquare size={18} style={{ color: 'var(--accent)' }} />
              ارسال پیامک به یک عضو
            </h2>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                انتخاب عضو
              </label>
              <select
                className="input-field"
                value={singleMemberId}
                onChange={(e) => setSingleMemberId(e.target.value)}
                required
              >
                <option value="">انتخاب کنید...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} — {m.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                متن پیامک
              </label>
              <textarea
                className="input-field min-h-[120px]"
                value={singleMessage}
                onChange={(e) => setSingleMessage(e.target.value)}
                placeholder="متن پیام را بنویسید..."
                required
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                {singleMessage.length.toLocaleString('fa-IR')} کاراکتر
              </p>
            </div>

            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                قالب‌های آماده
              </p>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => setSingleMessage(tpl.body)}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={sendingSingle || !singleMemberId || !singleMessage.trim()}
            >
              <Send size={16} />
              {sendingSingle ? 'در حال ارسال...' : 'ارسال پیامک'}
            </button>
          </form>

          <div className="space-y-4">
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  <Users size={20} />
                </div>
                <div>
                  <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                    {loadingMembers ? '…' : members.length.toLocaleString('fa-IR')}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    کل اعضا
                  </p>
                </div>
              </div>
            </div>
            {selectedMember && (
              <div className="panel-card p-4 space-y-2 text-sm">
                <p className="font-semibold" style={{ color: 'var(--text)' }}>
                  {selectedMember.full_name}
                </p>
                <p style={{ color: 'var(--text-secondary)' }} dir="ltr">
                  {selectedMember.phone}
                </p>
                {selectedMember.personnel_code && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }} dir="ltr">
                    کد: {selectedMember.personnel_code}
                  </p>
                )}
              </div>
            )}
            {isAdmin && (
              <button
                type="button"
                className="btn-outline w-full"
                onClick={() => switchTab('broadcast')}
              >
                <Send size={16} />
                رفتن به ارسال گروهی
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── ارسال گروهی ─── */}
      {tab === 'broadcast' && isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="panel-card p-6 space-y-4">
              <h2 className="section-title">متن پیام گروهی</h2>
              <textarea
                className="input-field min-h-[140px]"
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                placeholder="متن پیامک گروهی..."
                maxLength={1000}
              />
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>{charCount.toLocaleString('fa-IR')} کاراکتر</span>
                <span>حدود {smsUnits.toLocaleString('fa-IR')} پیامک</span>
              </div>
              <div
                className="rounded-xl p-4 text-sm whitespace-pre-wrap"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
              >
                {broadcastMsg.trim() || 'پیش‌نمایش متن...'}
              </div>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => setBroadcastMsg(tpl.body)}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-card p-6 space-y-3">
              <h2 className="section-title">مخاطبان</h2>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_OPTIONS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAudience(key)}
                    className="px-3.5 py-2 rounded-full text-sm transition-all"
                    style={{
                      background: audience === key ? 'var(--accent-soft)' : 'var(--bg-muted)',
                      color: audience === key ? 'var(--accent)' : 'var(--text-secondary)',
                      border:
                        audience === key
                          ? '1px solid var(--accent)'
                          : '1px solid transparent',
                      fontWeight: audience === key ? 600 : 400,
                    }}
                  >
                    {audienceFilterLabels[key]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}
                >
                  <Users size={20} />
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
                    {loadingMembers ? '…' : recipientCount.toLocaleString('fa-IR')}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    گیرنده
                  </p>
                </div>
              </div>
            </div>

            {isLargeBatch && (
              <div
                className="flex gap-2 p-3 rounded-xl text-xs"
                style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
              >
                <AlertTriangle size={16} className="shrink-0" />
                ارسال گروهی بزرگ — ممکن است زمان‌بر باشد.
              </div>
            )}

            <button
              type="button"
              className="btn-primary w-full"
              disabled={sendingBroadcast || !broadcastMsg.trim() || recipientCount === 0}
              onClick={() => setShowConfirm(true)}
            >
              <Send size={16} />
              {sendingBroadcast ? 'در حال ارسال...' : 'ارسال گروهی'}
            </button>
            <button
              type="button"
              className="btn-outline w-full"
              onClick={() => {
                saveBroadcastDraft({ message: broadcastMsg, audience });
                showToast('success', 'پیش‌نویس ذخیره شد');
              }}
            >
              ذخیره پیش‌نویس
            </button>

            {report && (
              <div className="panel-card p-4 text-sm space-y-1">
                <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                  آخرین گزارش
                </p>
                <p style={{ color: 'var(--success)' }}>
                  موفق: {report.success_count.toLocaleString('fa-IR')}
                </p>
                <p style={{ color: 'var(--danger)' }}>
                  ناموفق: {report.failure_count.toLocaleString('fa-IR')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── گزارش ─── */}
      {tab === 'logs' && isAdmin && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                className="input-field pr-10"
                placeholder="جستجو نام، تلفن یا متن..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
              />
            </div>
            <button type="button" className="btn-outline" onClick={loadLogs}>
              بروزرسانی
            </button>
          </div>

          {logError && (
            <div
              className="p-3 rounded-xl text-sm"
              style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              {logError}
            </div>
          )}

          <div className="panel-card overflow-hidden">
            {loadingLogs ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 skeleton" />
                ))}
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                {logSearch.trim() ? 'نتیجه‌ای یافت نشد' : 'هنوز پیامکی ثبت نشده'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr style={{ background: 'var(--bg-muted)' }}>
                      {['نام', 'تلفن', 'متن پیام', 'وضعیت', 'تاریخ'].map((h) => (
                        <th
                          key={h}
                          className="text-right text-xs font-semibold px-4 py-3"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => {
                      const st = normalizeSmsStatus(log.status);
                      const cfg = statusConfig[st];
                      return (
                        <tr key={log.id} className="table-row">
                          <td className="px-4 py-3 text-sm" style={{ color: 'var(--text)' }}>
                            {log.name || '—'}
                          </td>
                          <td
                            className="px-4 py-3 text-sm font-mono"
                            style={{ color: 'var(--text-secondary)' }}
                            dir="ltr"
                          >
                            {log.phone}
                          </td>
                          <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            <p className="line-clamp-2">{log.message}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`badge ${cfg.className}`}>{cfg.label}</span>
                          </td>
                          <td
                            className="px-4 py-3 text-xs whitespace-nowrap"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {formatDate(log.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!loadingLogs && filteredLogs.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {filteredLogs.length.toLocaleString('fa-IR')} مورد
              {logSearch.trim() ? ` از ${logs.length.toLocaleString('fa-IR')}` : ''}
            </p>
          )}
        </div>
      )}

      {/* تأیید ارسال گروهی */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfirm(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow)',
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                تأیید ارسال گروهی
              </h3>
              <button type="button" onClick={() => setShowConfirm(false)}>
                <X size={18} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              ارسال به{' '}
              <strong style={{ color: 'var(--accent)' }}>
                {recipientCount.toLocaleString('fa-IR')}
              </strong>{' '}
              نفر؟
            </p>
            <div className="flex gap-3">
              <button type="button" className="btn-primary flex-1" onClick={executeBroadcast}>
                بله، ارسال شود
              </button>
              <button type="button" className="btn-outline flex-1" onClick={() => setShowConfirm(false)}>
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
