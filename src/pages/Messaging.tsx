import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';


import { getMembers, isMemberActive } from '../services/memberService';
import {
  getMessages,
  createMessage,
  deleteMessage,
  recipientLabels,
  type Message,
  type MessageStatus,
  type RecipientType,
  type SendStats,
} from '../services/messagingService';
import FeatureLockedScreen from '../components/FeatureLockedScreen';
import {
  Send,
  Plus,
  X,
  Smartphone,
  Users,
  Clock,
  CheckCircle,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

const channelConfig: Record<string, { label: string; icon: typeof Smartphone; color: string; bg: string }> = {
  sms: { label: 'پیامک', icon: Smartphone, color: 'text-blue-400', bg: 'bg-blue-500/10' },
};

const statusConfig: Record<MessageStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'پیش‌نویس', color: 'text-gray-400', bg: 'bg-gray-500/10' },
  sent: { label: 'ارسال شده', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
};

export default function Messaging() {
  const { hasFeature } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<{ id: string; full_name: string; phone: string; end_date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [error, setError] = useState('');
  const [lastStats, setLastStats] = useState<SendStats | null>(null);
  const [form, setForm] = useState<{
    recipient_type: RecipientType;
    recipient_id: string;
    subject: string;
    body: string;
    channel: 'sms';
    personalize: boolean;
  }>({
    recipient_type: 'all',
    recipient_id: '',
    subject: '',
    body: '',
    channel: 'sms',
    personalize: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'draft' | 'sent'>('all');

  useEffect(() => {
    fetchMessages();
    fetchMembers();
  }, []);

  const fetchMessages = async () => {
    setLoading(true);
    const { data, error: fetchErr } = await getMessages();
    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setError('');
      setMessages(data || []);
    }
    setLoading(false);
  };

  const fetchMembers = async () => {
    const { data } = await getMembers();
    setMembers(data || []);
  };

  const filteredMessages = messages.filter((m) => {
    if (activeTab === 'all') return true;
    return m.status === activeTab;
  });

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { data, error: sendErr } = await createMessage({
      recipient_type: form.recipient_type,
      recipient_id: form.recipient_type === 'individual' && form.recipient_id ? Number(form.recipient_id) : null,
      subject: form.subject,
      body: form.body,
      channel: form.channel,
      status: 'sent',
      personalize: form.personalize,
    });
    setSubmitting(false);
    if (sendErr) {
      setError(sendErr.message);
      return;
    }
    setLastStats(data?.stats ?? null);
    setShowCompose(false);
    setForm({ ...form, subject: '', body: '', recipient_id: '' });
    fetchMessages();
  };

  const handleSaveDraft = async () => {
    setSubmitting(true);
    const { error: draftErr } = await createMessage({
      recipient_type: form.recipient_type,
      recipient_id: form.recipient_type === 'individual' && form.recipient_id ? Number(form.recipient_id) : null,
      subject: form.subject,
      body: form.body,
      channel: form.channel,
      status: 'draft',
      personalize: form.personalize,
    });
    setSubmitting(false);
    if (draftErr) {
      setError(draftErr.message);
      return;
    }
    setShowCompose(false);
    setForm({ ...form, subject: '', body: '', recipient_id: '' });
    fetchMessages();
  };

  const handleDelete = async (id: number) => {
    const { error: delErr } = await deleteMessage(id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    fetchMessages();
  };

  const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const expiringCount = members.filter((m) => isMemberActive(m.end_date) && m.end_date <= weekEnd).length;

  if (!hasFeature('messaging')) {
    return (
      <FeatureLockedScreen
        icon={Send}
        title="پیام‌رسانی هوشمند"
        description="این بخش با اشتراک ماهانه + هزینه فعال‌سازی در پکیج «مدیریت هوشمند» فعال می‌شود و شامل ارسال پیامک خودکار، یادآوری تمدید، قالب‌های آماده و ارتباط با اعضا و مربیان است."
        onBack={() => navigate('/dashboard')}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">پیام‌رسانی هوشمند</h1>
          <p className="text-gray-500 text-sm mt-1">ارسال پیامک به اعضا و مربیان</p>
        </div>
        <button onClick={() => setShowCompose(true)} className="btn-gold flex items-center gap-2">
          <Plus size={18} />
          پیام جدید
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">
          {error}
        </div>
      )}

      {lastStats && (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle size={16} />
          پیام ارسال شد: {lastStats.success_count} موفق از {lastStats.total} گیرنده
          {lastStats.failure_count > 0 && ` (${lastStats.failure_count} ناموفق)`}
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{members.length}</p>
              <p className="text-xs text-gray-500">کل مخاطبین</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{expiringCount}</p>
              <p className="text-xs text-gray-500">اعضای در حال انقضا</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">
                {messages.filter((m) => m.status === 'sent').length}
              </p>
              <p className="text-xs text-gray-500">پیام ارسال شده</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        {(['all', 'sent', 'draft'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm rounded-lg transition-all duration-200 ${
              activeTab === tab
                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                : 'text-gray-400 hover:text-gray-300 bg-white/5'
            }`}
          >
            {tab === 'all' ? 'همه' : tab === 'sent' ? 'ارسال شده' : 'پیش‌نویس'}
          </button>
        ))}
      </div>

      {/* Messages list */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="w-6 h-6 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">پیامی یافت نشد</div>
        ) : (
          <div className="divide-y divide-gold-500/10">
            {filteredMessages.map((msg) => {
              const chCfg = channelConfig[msg.channel] || channelConfig.sms;
              const rLabel = recipientLabels[msg.recipient_type] || msg.recipient_type;
              const sCfg = statusConfig[msg.status];
              return (
                <div key={msg.id} className="p-4 hover:bg-gold-500/5 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${chCfg.bg} ${chCfg.color} flex items-center gap-1`}>
                          <chCfg.icon size={10} />
                          {chCfg.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400">
                          {rLabel}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${sCfg.bg} ${sCfg.color}`}>
                          {sCfg.label}
                        </span>
                        {msg.recipient_type === 'individual' && msg.sender_name && (
                          <span className="text-[10px] text-gray-600">
                            توسط {msg.sender_name}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-medium text-white truncate">{msg.subject || 'بدون موضوع'}</h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{msg.body}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-xs text-gray-600 whitespace-nowrap">
                        {msg.sent_at
                          ? new Date(msg.sent_at.replace(' ', 'T')).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' })
                          : msg.created_at
                            ? new Date(msg.created_at.replace(' ', 'T')).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' })
                            : '—'}
                      </span>
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors"
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">ارسال پیام جدید</h2>
              <button onClick={() => setShowCompose(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm bg-gold-500/20 text-gold-400 border border-gold-500/30 mb-4">
              <Smartphone size={14} />
              ارسال پیامک
            </div>

            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">گیرنده</label>
                <select
                  value={form.recipient_type}
                  onChange={(e) => setForm({ ...form, recipient_type: e.target.value as RecipientType })}
                  className="input-dark"
                >
                  <option value="all">همه اعضا</option>
                  <option value="expiring">اعضای در حال انقضا</option>
                  <option value="individual">فردی</option>
                  <option value="coaches">مربیان</option>
                </select>
              </div>

              {form.recipient_type === 'individual' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">انتخاب عضو</label>
                  <select
                    value={form.recipient_id}
                    onChange={(e) => setForm({ ...form, recipient_id: e.target.value })}
                    className="input-dark"
                    required
                  >
                    <option value="">انتخاب کنید</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name} - {m.phone}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">موضوع</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="input-dark"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">متن پیام</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  className="input-dark h-32 resize-none"
                  required
                />
              </div>

              {/* Smart templates */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">قالب‌های آماده</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      label: 'یادآوری تمدید',
                      subject: 'یادآوری تمدید عضویت',
                      body: 'کاربر گرامی، عضویت شما در آلفا جیم در حال انقضا است. لطفاً جهت تمدید اقدام فرمایید.',
                    },
                    {
                      label: 'خوش‌آمدگویی',
                      subject: 'به آلفا جیم خوش آمدید',
                      body: 'کاربر گرامی، به خانواده آلفا جیم خوش آمدید. ما آماده‌ایم تا بهترین تجربه ورزشی را برای شما فراهم کنیم.',
                    },
                    {
                      label: 'تخفیف ویژه',
                      subject: 'تخفیف ویژه آلفا جیم',
                      body: 'کاربر گرامی، به مناسبت ویژه، تخفیفی برای تمدید عضویت شما در نظر گرفته شده است. همین الان اقدام کنید!',
                    },
                  ].map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => setForm({ ...form, subject: tpl.subject, body: tpl.body })}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gold-500/10 text-gold-400 hover:bg-gold-500/20 transition-colors"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Personalization */}
              <div>
                <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${form.personalize ? 'bg-gold-500/15 border-gold-500/40' : 'bg-white/5 border-white/10'}`}>
                  <input
                    type="checkbox"
                    checked={form.personalize}
                    onChange={(e) => setForm({ ...form, personalize: e.target.checked })}
                    className="w-4 h-4 accent-gold-500 shrink-0"
                  />
                  <span className="text-sm text-gold-400">پیام شخصی‌سازی‌شده</span>
                  <span className="text-[10px] text-gray-500 mr-auto">هر پیام به‌صورت جداگانه با نام، هدف و روزهای باقی‌ماندهٔ عضو پر می‌شود</span>
                </label>
              </div>

              {form.personalize && (
                <div className="space-y-2">
                  <label className="block text-sm text-gray-400 mb-1">متغیرهای قابل استفاده</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { var: '{name}', desc: 'نام عضو' },
                      { var: '{goal}', desc: 'هدف تمرینی' },
                      { var: '{sport}', desc: 'رشته ورزشی' },
                      { var: '{days_left}', desc: 'روزهای باقی‌مانده' },
                    ].map((v) => (
                      <button
                        key={v.var}
                        type="button"
                        onClick={() => setForm({ ...form, body: form.body + v.var })}
                        title={v.desc}
                        className="text-xs px-2.5 py-1 rounded-lg bg-white/5 text-gray-300 hover:bg-gold-500/10 hover:text-gold-400 transition-colors border border-white/10"
                      >
                        {v.var} <span className="text-gray-600">({v.desc})</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        label: 'یادآوری شخصی تمدید',
                        body: '{name} عزیز، عضویت شما در آلفا جیم تنها {days_left} روز دیگر باقی است. برای تمدید همین امروز اقدام کنید.',
                      },
                      {
                        label: 'تشویق هدف',
                        body: '{name} عزیز، هدف شما {goal} است. {sport} را منظم ادامه دهید و به مسیرتان اعتماد کنید.',
                      },
                    ].map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() => setForm({ ...form, body: tpl.body })}
                        className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.recipient_type !== 'individual' && form.recipient_type !== 'coaches' && (
                <p className="text-[10px] text-gray-600 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  پیامک به تعداد مخاطبین بالا ممکن است چند ثانیه طول بکشد.
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="btn-gold flex-1 flex items-center justify-center gap-2">
                  <Send size={16} />
                  {submitting ? 'در حال ارسال...' : 'ارسال'}
                </button>
                <button type="button" onClick={handleSaveDraft} disabled={submitting} className="btn-outline-gold">
                  ذخیره پیش‌نویس
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
