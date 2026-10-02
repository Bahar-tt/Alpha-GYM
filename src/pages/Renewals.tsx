import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';


import { getMembers, isMemberActive, updateMemberExpiry, type MemberRecord } from '../services/memberService';
import {
  getRenewals, createRenewal, updateRenewalStatus,
  type Renewal, type RenewalStatus,
} from '../services/renewalService';
import {
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  X,
  DollarSign,
} from 'lucide-react';

const statusConfig = {
  pending: { label: 'در انتظار', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  completed: { label: 'تکمیل شده', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  cancelled: { label: 'لغو شده', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
};

const membershipLabels: Record<string, string> = {
  monthly: 'ماهانه',
  quarterly: 'سه ماهه',
  yearly: 'سالانه',
  vip: 'VIP',
};

export default function Renewals() {
  const { user } = useAuth();
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    member_id: '',
    membership_type: 'monthly' as 'monthly' | 'quarterly' | 'yearly' | 'vip',
    amount: 0,
    new_end_date: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchRenewals();
    fetchMembers();
  }, []);

  const fetchRenewals = async () => {
    setLoading(true);
    const { data } = await getRenewals();
    setRenewals(data || []);
    setLoading(false);
  };

  const fetchMembers = async () => {
    const { data } = await getMembers();
    setMembers((data || []).filter((m) => isMemberActive(m.end_date)));
  };

  const filteredRenewals = renewals.filter((r) => {
    const name = r.member_name || '';
    const phone = r.member_phone || '';
    const matchesSearch = name.includes(search) || phone.includes(search);
    const matchesFilter = filterStatus === 'all' || r.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const handleSelectMember = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    if (member) {
      const durationMap: Record<string, number> = { monthly: 30, quarterly: 90, yearly: 365, vip: 365 };
      const duration = durationMap[form.membership_type] || 30;
      const newEnd = new Date(new Date(member.end_date).getTime() + duration * 24 * 60 * 60 * 1000);
      setForm({
        ...form,
        member_id: memberId,
        new_end_date: newEnd.toISOString().split('T')[0],
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const member = members.find((m) => m.id === form.member_id);

    if (member) {
      await updateMemberExpiry(form.member_id, form.new_end_date, member.weekly_sessions);
    }

    await createRenewal({
      member_id: Number(form.member_id),
      membership_type: form.membership_type,
      old_end_date: member?.end_date || undefined,
      new_end_date: form.new_end_date || undefined,
      amount: form.amount,
      status: 'completed',
      renewed_by: user?.id || null,
    });

    setShowModal(false);
    setSubmitting(false);
    fetchRenewals();
    fetchMembers();
  };

  const handleStatusChange = async (id: number, status: RenewalStatus) => {
    await updateRenewalStatus(id, status);
    fetchRenewals();
  };

  const totalRevenue = renewals
    .filter((r) => r.status === 'completed')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const toFa = (n: number) => n.toLocaleString('fa-IR');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">تمدید عضویت</h1>
        <button onClick={() => setShowModal(true)} className="btn-gold flex items-center gap-2">
          <Plus size={18} />
          ثبت تمدید جدید
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gold-500/10 flex items-center justify-center">
              <DollarSign size={20} className="text-gold-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{toFa(totalRevenue)} ت</p>
              <p className="text-xs text-gray-500">کل درآمد تمدیدها</p>
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
                {toFa(renewals.filter((r) => r.status === 'completed').length)}
              </p>
              <p className="text-xs text-gray-500">تمدید تکمیل شده</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">
                {toFa(renewals.filter((r) => r.status === 'pending').length)}
              </p>
              <p className="text-xs text-gray-500">در انتظار تمدید</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="جستجو..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-dark pr-10"
          />
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'pending', 'completed', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-4 py-2 text-sm rounded-lg transition-all duration-200 ${
                filterStatus === s
                  ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                  : 'text-gray-400 hover:text-gray-300 bg-white/5'
              }`}
            >
              {s === 'all' ? 'همه' : statusConfig[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold-500/10">
                {['عضو', 'نوع عضویت', 'تاریخ پایان قبلی', 'تاریخ پایان جدید', 'مبلغ', 'وضعیت', 'عملیات'].map((h) => (
                  <th key={h} className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <div className="w-6 h-6 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredRenewals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    تمدیدی یافت نشد
                  </td>
                </tr>
              ) : (
                filteredRenewals.map((r) => {
                  const cfg = statusConfig[r.status];
                  return (
                    <tr key={r.id} className="table-row">
                      <td className="px-4 py-3 text-sm text-white">{r.member_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 rounded-full bg-gold-500/10 text-gold-400">
                          {membershipLabels[r.membership_type || ''] || r.membership_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {r.old_end_date ? new Date(r.old_end_date).toLocaleDateString('fa-IR') : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {r.new_end_date ? new Date(r.new_end_date).toLocaleDateString('fa-IR') : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gold-400 font-medium">
                        {toFa(Number(r.amount) || 0)} ت
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${cfg.bg} ${cfg.color} flex items-center gap-1 w-fit`}>
                          <cfg.icon size={12} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStatusChange(r.id, 'completed')}
                              className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-gray-400 hover:text-emerald-400 transition-colors"
                              title="تکمیل"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => handleStatusChange(r.id, 'cancelled')}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                              title="لغو"
                            >
                              <XCircle size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">ثبت تمدید جدید</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">انتخاب عضو</label>
                <select
                  value={form.member_id}
                  onChange={(e) => handleSelectMember(e.target.value)}
                  className="input-dark"
                  required
                >
                  <option value="">انتخاب کنید</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} - {m.phone} (انقضا: {new Date(m.end_date).toLocaleDateString('fa-IR')})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">نوع عضویت جدید</label>
                  <select
                    value={form.membership_type}
                    onChange={(e) => setForm({ ...form, membership_type: e.target.value as 'monthly' | 'quarterly' | 'yearly' | 'vip' })}
                    className="input-dark"
                  >
                    <option value="monthly">ماهانه</option>
                    <option value="quarterly">سه ماهه</option>
                    <option value="yearly">سالانه</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">مبلغ (تومان)</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                    className="input-dark"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">تاریخ پایان جدید</label>
                <input
                  type="date"
                  value={form.new_end_date}
                  onChange={(e) => setForm({ ...form, new_end_date: e.target.value })}
                  className="input-dark"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="btn-gold flex-1">
                  {submitting ? 'در حال ثبت...' : 'ثبت تمدید'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-outline-gold">
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
