import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadJson, saveJson } from '../lib/localStore';
import { getMembers, isMemberActive } from '../services/memberService';
import {
  Send,
  Plus,
  X,
  MessageSquare,
  Mail,
  Smartphone,
  Users,
  Clock,
  CheckCircle,
  FileText,
} from 'lucide-react';

const MESSAGES_KEY = 'alpha_gym_messages';

interface Message {
  id: string;
  sender_id: string;
  recipient_type: 'all' | 'expiring' | 'individual' | 'coaches';
  recipient_id: string | null;
  subject: string;
  body: string;
  channel: 'sms' | 'email' | 'push';
  status: 'draft' | 'sent' | 'failed';
  sent_at: string | null;
  created_at: string;
}

const channelConfig = {
  sms: { label: 'پیامک', icon: Smartphone, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  email: { label: 'ایمیل', icon: Mail, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  push: { label: 'پوش نوتیفیکیشن', icon: MessageSquare, color: 'text-gold-400', bg: 'bg-gold-500/10' },
};

const recipientConfig = {
  all: { label: 'همه اعضا', icon: Users },
  expiring: { label: 'اعضای در حال انقضا', icon: Clock },
  individual: { label: 'فردی', icon: FileText },
  coaches: { label: 'مربیان', icon: Users },
};

const statusConfig = {
  draft: { label: 'پیش‌نویس', color: 'text-gray-400', bg: 'bg-gray-500/10' },
  sent: { label: 'ارسال شده', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  failed: { label: 'ناموفق', color: 'text-red-400', bg: 'bg-red-500/10' },
};

export default function Messaging() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<{ id: string; full_name: string; phone: string; end_date: string; is_active?: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState({
    recipient_type: 'all' as 'all' | 'expiring' | 'individual' | 'coaches',
    recipient_id: '',
    subject: '',
    body: '',
    channel: 'sms' as 'sms' | 'email' | 'push',
  });
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'draft' | 'sent'>('all');

  useEffect(() => {
    fetchMessages();
    fetchMembers();
  }, []);

  const fetchMessages = async () => {
    setLoading(true);
    const stored = loadJson<Message[]>(MESSAGES_KEY, []);
    setMessages(stored.sort((a, b) => b.created_at.localeCompare(a.created_at)));
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

    const payload: Message = {
      id: String(Date.now()),
      sender_id: user?.id || '',
      recipient_type: form.recipient_type,
      recipient_id: form.recipient_type === 'individual' && form.recipient_id ? form.recipient_id : null,
      subject: form.subject,
      body: form.body,
      channel: form.channel,
      status: 'sent',
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const list = loadJson<Message[]>(MESSAGES_KEY, []);
    saveJson(MESSAGES_KEY, [payload, ...list]);
    setShowCompose(false);
    setSubmitting(false);
    fetchMessages();
  };

  const handleSaveDraft = async () => {
    setSubmitting(true);
    const payload: Message = {
      id: String(Date.now() + 1),
      sender_id: user?.id || '',
      recipient_type: form.recipient_type,
      recipient_id: form.recipient_type === 'individual' && form.recipient_id ? form.recipient_id : null,
      subject: form.subject,
      body: form.body,
      channel: form.channel,
      status: 'draft',
      sent_at: null,
      created_at: new Date().toISOString(),
    };

    const list = loadJson<Message[]>(MESSAGES_KEY, []);
    saveJson(MESSAGES_KEY, [payload, ...list]);
    setShowCompose(false);
    setSubmitting(false);
    fetchMessages();
  };

  const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const expiringCount = members.filter((m) => isMemberActive(m.end_date) && m.end_date <= weekEnd).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">پیام‌رسانی هوشمند</h1>
          <p className="text-gray-500 text-sm mt-1">ارسال پیام به اعضا و مربیان</p>
        </div>
        <button onClick={() => setShowCompose(true)} className="btn-gold flex items-center gap-2">
          <Plus size={18} />
          پیام جدید
        </button>
      </div>

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
              const chCfg = channelConfig[msg.channel];
              const rCfg = recipientConfig[msg.recipient_type];
              const sCfg = statusConfig[msg.status];
              return (
                <div key={msg.id} className="p-4 hover:bg-gold-500/5 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${chCfg.bg} ${chCfg.color} flex items-center gap-1`}>
                          <chCfg.icon size={10} />
                          {chCfg.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400 flex items-center gap-1">
                          <rCfg.icon size={10} />
                          {rCfg.label}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${sCfg.bg} ${sCfg.color}`}>
                          {sCfg.label}
                        </span>
                      </div>
                      <h3 className="text-sm font-medium text-white truncate">{msg.subject}</h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{msg.body}</p>
                    </div>
                    <span className="text-xs text-gray-600 whitespace-nowrap">
                      {msg.sent_at
                        ? new Date(msg.sent_at).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' })
                        : '—'}
                    </span>
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

            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">کانال ارسال</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(channelConfig) as Array<keyof typeof channelConfig>).map((ch) => {
                    const cfg = channelConfig[ch];
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setForm({ ...form, channel: ch })}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                          form.channel === ch
                            ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                            : 'text-gray-400 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <cfg.icon size={14} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">گیرنده</label>
                <select
                  value={form.recipient_type}
                  onChange={(e) => setForm({ ...form, recipient_type: e.target.value as any })}
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
                  required
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
