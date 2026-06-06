import { useEffect, useMemo, useState } from 'react';
import { Send, Users, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { getMembers, type MemberRecord } from '../services/memberService';
import {
  loadBroadcastDraft,
  saveBroadcastDraft,
  sendBroadcast,
  type BroadcastReport,
} from '../services/smsService';
import {
  audienceFilterLabels,
  filterMembersByAudience,
  toBroadcastRecipients,
  type AudienceFilter,
} from '../lib/broadcastAudience';

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

export default function Broadcast() {
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<AudienceFilter>('active');
  const [allMembers, setAllMembers] = useState<MemberRecord[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [report, setReport] = useState<BroadcastReport | null>(null);

  useEffect(() => {
    const draft = loadBroadcastDraft();
    if (draft) {
      setMessage(draft.message);
      if (AUDIENCE_OPTIONS.includes(draft.audience as AudienceFilter)) {
        setAudience(draft.audience as AudienceFilter);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingMembers(true);
      const { data } = await getMembers();
      if (!cancelled) {
        setAllMembers(data || []);
        setLoadingMembers(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredMembers = useMemo(() => {
    return filterMembersByAudience(allMembers || [], audience);
  }, [allMembers, audience]);

  const recipients = useMemo(() => toBroadcastRecipients(filteredMembers), [filteredMembers]);

  const recipientCount = recipients.length;
  const isLargeBatch = recipientCount > LARGE_BATCH_THRESHOLD;
  const charCount = message.length;
  const smsUnits = Math.max(1, Math.ceil(charCount / SMS_CHAR_SEGMENT) || 1);

  const previewText = message.trim() || 'متن پیام اینجا نمایش داده می‌شود...';

  const handleSaveDraft = () => {
    saveBroadcastDraft({ message, audience });
    setToast({ type: 'success', text: 'پیش‌نویس ذخیره شد' });
    setTimeout(() => setToast(null), 3000);
  };

  const executeSend = async () => {
    setShowConfirm(false);
    setSending(true);
    setReport(null);

    const { data, error } = await sendBroadcast(recipients, message.trim());

    setSending(false);

    if (error) {
      setToast({ type: 'error', text: error.message });
      return;
    }

    if (data) {
      setReport(data);
      const summary = `${data.success_count.toLocaleString('fa-IR')} موفق، ${data.failure_count.toLocaleString('fa-IR')} ناموفق`;
      setToast({
        type: data.failure_count > 0 ? 'error' : 'success',
        text: `ارسال انجام شد: ${summary}`,
      });
    }
  };

  const handleSendClick = () => {
    if (!message.trim()) return;
    if (recipientCount === 0) {
      setToast({ type: 'error', text: 'گیرنده‌ای برای ارسال وجود ندارد' });
      return;
    }
    setShowConfirm(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl border shadow-lg flex items-center gap-2 text-sm ${
            toast.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/15 border-red-500/30 text-red-300'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {toast.text}
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-white">ارسال پیام گروهی</h1>
        <p className="text-sm text-gray-500 mt-1">Smart Messaging Panel</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gold-400">متن پیام</h2>
            <textarea
              className="input-dark min-h-[140px] resize-y"
              placeholder="متن پیامک را بنویسید..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-500">
              <span>{charCount.toLocaleString('fa-IR')} کاراکتر</span>
              <span>حدود {smsUnits.toLocaleString('fa-IR')} پیامک (۷۰ کاراکتر)</span>
            </div>
            <div className="rounded-xl bg-white/5 border border-gold-500/10 p-4">
              <p className="text-xs text-gray-500 mb-2">پیش‌نمایش</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{previewText}</p>
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gold-400">مخاطبان</h2>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_OPTIONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAudience(key)}
                  className={`px-4 py-2 rounded-full text-sm transition-all duration-200 border ${
                    audience === key
                      ? 'bg-gold-500/20 text-gold-400 border-gold-500/40'
                      : 'bg-white/5 text-gray-400 border-transparent hover:border-gold-500/20'
                  }`}
                >
                  {audienceFilterLabels[key]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gold-400">قبل از ارسال</h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gold-500/10 flex items-center justify-center">
                <Users size={20} className="text-gold-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {loadingMembers ? '...' : recipientCount.toLocaleString('fa-IR')}
                </p>
                <p className="text-xs text-gray-500">گیرنده تقریبی</p>
              </div>
            </div>

            {isLargeBatch && (
              <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  بیش از {LARGE_BATCH_THRESHOLD.toLocaleString('fa-IR')} گیرنده انتخاب شده است. ارسال ممکن است
                  زمان‌بر باشد.
                </span>
              </div>
            )}

            {recipientCount === 0 && !loadingMembers && (
              <p className="text-xs text-red-400">برای فیلتر انتخاب‌شده گیرنده‌ای یافت نشد.</p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="btn-gold flex items-center justify-center gap-2 disabled:opacity-50"
              disabled={sending || !message.trim() || recipientCount === 0}
              onClick={handleSendClick}
            >
              {sending ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <Send size={18} />
              )}
              {sending ? 'در حال ارسال...' : 'ارسال پیام'}
            </button>
            <button type="button" className="btn-outline-gold" onClick={handleSaveDraft}>
              ذخیره پیش‌نویس
            </button>
          </div>

          {report && (
            <div className="glass-card p-4 text-sm space-y-2">
              <p className="text-gray-400 font-medium">گزارش آخرین ارسال</p>
              <p className="text-emerald-400">
                موفق: {report.success_count.toLocaleString('fa-IR')}
              </p>
              <p className="text-red-400">
                ناموفق: {report.failure_count.toLocaleString('fa-IR')}
              </p>
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 w-full max-w-md space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">تأیید ارسال</h3>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              آیا از ارسال پیام به{' '}
              <span className="text-gold-400 font-bold">
                {recipientCount.toLocaleString('fa-IR')}
              </span>{' '}
              نفر اطمینان دارید؟
            </p>
            {isLargeBatch && (
              <p className="text-xs text-amber-400">
                این ارسال گروهی بزرگ است و ممکن است چند دقیقه طول بکشد.
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" className="btn-gold flex-1" onClick={executeSend}>
                بله، ارسال شود
              </button>
              <button
                type="button"
                className="btn-outline-gold flex-1"
                onClick={() => setShowConfirm(false)}
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
