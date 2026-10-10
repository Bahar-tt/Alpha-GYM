import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadJson, saveJson } from '../lib/localStore';
import {
  getMembers,
  updateMemberExpiry,
  type MemberRecord,
  type MembershipType,
} from '../services/memberService';
import { receiptPublicUrl } from '../services/receiptService';
import { ARCHIVED_KEY, RENEWALS_KEY, getMembershipStatus } from '../lib/membershipStatus';
import { formatJalali } from '../lib/jalaliDate';
import { Search, CheckCircle, XCircle, Clock, X, AlertTriangle, Archive, ExternalLink } from 'lucide-react';

interface RenewalLog {
  id: string;
  member_id: string;
  old_end_date: string;
  new_end_date: string;
  membership_type: string;
  months: number;
  amount: number;
  status: 'completed' | 'rejected';
  renewed_by: string | null;
  created_at: string;
  receipt_token?: string;
  members?: { full_name: string; phone: string };
}

const MONTH_OPTIONS = [
  { months: 1, type: 'monthly' as MembershipType, label: '۱ ماه' },
  { months: 3, type: 'quarterly' as MembershipType, label: '۳ ماه' },
  { months: 6, type: 'quarterly' as MembershipType, label: '۶ ماه' },
  { months: 12, type: 'yearly' as MembershipType, label: '۱۲ ماه' },
];

function addMonthsToIso(iso: string, months: number): string {
  const d = new Date(iso + 'T12:00:00');
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const base = d < today ? today : d;
  base.setMonth(base.getMonth() + months);
  return base.toISOString().split('T')[0];
}

export default function Renewals() {
  const { user, isAdmin } = useAuth();
  const [allMembers, setAllMembers] = useState<MemberRecord[]>([]);
  const [archivedIds, setArchivedIds] = useState<string[]>(() => loadJson<string[]>(ARCHIVED_KEY, []));
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [approveTarget, setApproveTarget] = useState<MemberRecord | null>(null);
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [lastReceiptUrl, setLastReceiptUrl] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await getMembers();
    setAllMembers(data || []);
    setArchivedIds(loadJson<string[]>(ARCHIVED_KEY, []));
    setLoading(false);
  };

  const queue = useMemo(() => {
    const archived = new Set(archivedIds);
    return (allMembers || [])
      .filter((m) => {
        if (archived.has(m.id)) return false;
        return getMembershipStatus(m.end_date).kind === 'expired';
      })
      .sort((a, b) => a.end_date.localeCompare(b.end_date));
  }, [allMembers, archivedIds]);

  const filtered = queue.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return m.full_name.toLowerCase().includes(q) || m.phone.includes(search);
  });

  const handleReject = (member: MemberRecord) => {
    if (!confirm(`پرونده «${member.full_name}» رد و بایگانی شود؟`)) return;
    const next = [...new Set([...archivedIds, member.id])];
    setArchivedIds(next);
    saveJson(ARCHIVED_KEY, next);
    const log: RenewalLog = {
      id: String(Date.now()),
      member_id: member.id,
      old_end_date: member.end_date,
      new_end_date: member.end_date,
      membership_type: member.membership_type,
      months: 0,
      amount: 0,
      status: 'rejected',
      renewed_by: user?.id || null,
      created_at: new Date().toISOString(),
      members: { full_name: member.full_name, phone: member.phone },
    };
    saveJson(RENEWALS_KEY, [log, ...loadJson<RenewalLog[]>(RENEWALS_KEY, [])]);
  };

  const openApprove = (member: MemberRecord) => {
    setApproveTarget(member);
    setSelectedMonths(1);
    setAmount(Number(member.monthly_fee) || 0);
    setLastReceiptUrl('');
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setSubmitting(true);
    const opt = MONTH_OPTIONS.find((o) => o.months === selectedMonths) || MONTH_OPTIONS[0];
    const newEnd = addMonthsToIso(approveTarget.end_date, selectedMonths);

    const result = await updateMemberExpiry(approveTarget.id, newEnd, approveTarget.weekly_sessions, {
      amount,
      months: selectedMonths,
      membership_type: opt.type,
    });

    const receiptToken =
      result.data && typeof result.data === 'object' && 'receipt' in result.data
        ? (result.data as { receipt?: { token?: string } }).receipt?.token
        : undefined;

    if (receiptToken) {
      setLastReceiptUrl(receiptPublicUrl(receiptToken));
    }

    const log: RenewalLog = {
      id: String(Date.now()),
      member_id: approveTarget.id,
      old_end_date: approveTarget.end_date,
      new_end_date: newEnd,
      membership_type: opt.type,
      months: selectedMonths,
      amount,
      status: 'completed',
      renewed_by: user?.id || null,
      created_at: new Date().toISOString(),
      receipt_token: receiptToken,
      members: { full_name: approveTarget.full_name, phone: approveTarget.phone },
    };
    saveJson(RENEWALS_KEY, [log, ...loadJson<RenewalLog[]>(RENEWALS_KEY, [])]);

    setSubmitting(false);
    if (!receiptToken) setApproveTarget(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">تمدید عضویت</h1>
        <p className="page-subtitle">اعضای منقضی — تأیید تمدید با صدور فیش آنلاین</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{queue.length.toLocaleString('fa-IR')}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>در انتظار تمدید</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
              <Clock size={20} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                {allMembers.filter((m) => getMembershipStatus(m.end_date).kind === 'expiring_soon').length.toLocaleString('fa-IR')}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>کمتر از ۷ روز</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
              <Archive size={20} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{archivedIds.length.toLocaleString('fa-IR')}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>بایگانی</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        <input className="input-field pr-10" placeholder="جستجو..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="panel-card overflow-hidden">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr style={{ background: 'var(--bg-muted)' }}>
              {['عضو', 'تلفن', 'پایان', 'وضعیت', 'عملیات'].map((h) => (
                <th key={h} className="text-right text-xs font-semibold px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>صف خالی است</td></tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="table-row row-expired">
                  <td className="px-4 py-3.5 text-sm font-semibold" style={{ color: 'var(--text)' }}>{m.full_name}</td>
                  <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{m.phone}</td>
                  <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--danger)' }}>{formatJalali(m.end_date)}</td>
                  <td className="px-4 py-3.5"><span className="badge badge-danger">{getMembershipStatus(m.end_date).label}</span></td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openApprove(m)} className="btn-primary py-2 px-3 text-xs"><CheckCircle size={14} /> تأیید</button>
                      <button type="button" onClick={() => handleReject(m)} className="btn-danger py-2 px-3 text-xs"><XCircle size={14} /> رد</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {approveTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={(e) => e.target === e.currentTarget && setApproveTarget(null)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-4 flex justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>تأیید تمدید</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{approveTarget.full_name}</p>
              </div>
              <button type="button" onClick={() => setApproveTarget(null)}><X size={18} /></button>
            </div>
            <div className="px-5 py-5 space-y-4">
              {lastReceiptUrl ? (
                <div className="p-4 rounded-xl space-y-2" style={{ background: 'var(--success-soft)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>تمدید ثبت شد — فیش آنلاین:</p>
                  <a href={lastReceiptUrl} target="_blank" rel="noreferrer" className="text-xs break-all flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                    <ExternalLink size={12} /> {lastReceiptUrl}
                  </a>
                  <button type="button" className="btn-primary w-full mt-2" onClick={() => setApproveTarget(null)}>بستن</button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    {MONTH_OPTIONS.map((o) => (
                      <button key={o.months} type="button" onClick={() => setSelectedMonths(o.months)}
                        className="py-2.5 rounded-xl text-sm font-semibold"
                        style={{
                          background: selectedMonths === o.months ? 'var(--accent)' : 'var(--bg-muted)',
                          color: selectedMonths === o.months ? '#fff' : 'var(--text)',
                        }}>{o.label}</button>
                    ))}
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    پایان جدید: <strong style={{ color: 'var(--success)' }}>{formatJalali(addMonthsToIso(approveTarget.end_date, selectedMonths))}</strong>
                  </p>
                  {isAdmin && (
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>مبلغ فیش (تومان)</label>
                      <input type="number" className="input-field" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
                    </div>
                  )}
                  <div className="flex flex-row-reverse gap-2 pt-2">
                    <button type="button" className="btn-primary flex-1" disabled={submitting} onClick={handleApprove}>
                      {submitting ? '...' : 'تأیید + صدور فیش'}
                    </button>
                    <button type="button" className="btn-outline" onClick={() => setApproveTarget(null)}>انصراف</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
