import { useEffect, useMemo, useState } from 'react';
import {
  addMember,
  deleteMember,
  getMembers,
  getMemberById,
  updateMember,
  recordAttendance,
  type MemberFormPayload,
  type MemberRecord,
  type MembershipType,
} from '../services/memberService';
import { getCoaches, type Coach } from '../services/coachService';
import { getMemberReceipts, receiptPublicUrl, type Receipt } from '../services/receiptService';
import { getApiErrorMessage } from '../lib/errors';
import {
  addJalaliMonths,
  formatJalali,
  jalaliToGregorianIso,
  gregorianToJalali,
  todayJalali,
  type JalaliDate,
} from '../lib/jalaliDate';
import {
  getMembershipStatus,
  monthsForMembershipType,
  ARCHIVED_KEY,
  RENEWALS_KEY,
} from '../lib/membershipStatus';
import { loadJson } from '../lib/localStore';
import JalaliDatePicker from '../components/JalaliDatePicker';
import ProfileExtrasFields, { emptyExtras, type ProfileExtras } from '../components/ProfileExtrasFields';
import PrintCardButton from '../components/PrintCardButton';
import {
  Pencil,
  Trash2,
  UserPlus,
  Search,
  X,
  Eye,
  Fingerprint,
  ExternalLink,
  CalendarCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';

type Member = MemberRecord;

const membershipLabels: Record<MembershipType, string> = {
  monthly: 'ماهانه (۱ ماه)',
  quarterly: 'سه‌ماهه (۳ ماه)',
  yearly: 'سالانه (۱۲ ماه)',
  vip: 'VIP (۱۲ ماه)',
};

interface MemberForm {
  first_name: string;
  last_name: string;
  phone: string;
  national_id: string;
  membership_type: MembershipType;
  birthday_jalali: JalaliDate | null;
  personnel_code: string;
  coach_id: string;
  coach_name: string;
  monthly_fee: number;
  coach_commission_percent: number;
  weekly_sessions: number;
  extras: ProfileExtras;
}

interface RenewalLog {
  member_id: string;
  status: string;
}

function parseBirthdayToJalali(raw: string): JalaliDate | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (s.includes('/') || (s.includes('-') && Number(s.slice(0, 4)) > 1200)) {
    const parts = s.split(/[/-]/).map(Number);
    if (parts.length === 3 && parts[0] > 1200 && parts[1] >= 1 && parts[1] <= 12 && parts[2] >= 1) {
      return { year: parts[0], month: parts[1], day: parts[2] };
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try {
      return gregorianToJalali(s);
    } catch {
      return null;
    }
  }
  return null;
}

function birthdayToStorage(d: JalaliDate | null): string {
  if (!d) return '';
  return `${d.year}/${String(d.month).padStart(2, '0')}/${String(d.day).padStart(2, '0')}`;
}

function splitName(full: string): { first: string; last: string } {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function formatJalaliDisplay(d: JalaliDate): string {
  return `${d.year}/${String(d.month).padStart(2, '0')}/${String(d.day).padStart(2, '0')}`;
}

const emptyForm = (): MemberForm => ({
  first_name: '',
  last_name: '',
  phone: '',
  national_id: '',
  membership_type: 'monthly',
  birthday_jalali: null,
  personnel_code: '',
  coach_id: '',
  coach_name: '',
  monthly_fee: 0,
  coach_commission_percent: 0,
  weekly_sessions: 3,
  extras: emptyExtras(),
});

function isValidNationalId(code: string): boolean {
  const c = code.trim();
  if (!/^\d{10}$/.test(c)) return false;
  if (/^(\d)\1{9}$/.test(c)) return false;
  const check = Number(c[9]);
  const sum = [...c.slice(0, 9)].reduce((s, d, i) => s + Number(d) * (10 - i), 0);
  const r = sum % 11;
  return r < 2 ? check === r : check === 11 - r;
}

function StatusBadge({ endDate, archived }: { endDate: string; archived?: boolean }) {
  const st = getMembershipStatus(endDate, archived);
  if (st.kind === 'active') return <span className="badge badge-success">{st.label}</span>;
  if (st.kind === 'expiring_soon') return <span className="badge badge-danger">{st.label}</span>;
  if (st.kind === 'expired') {
    return (
      <Link to="/renewals" className="badge badge-danger hover:opacity-90">
        {st.label}
      </Link>
    );
  }
  if (st.kind === 'archived') return <span className="badge badge-warning">{st.label}</span>;
  return <span className="badge badge-info">{st.label}</span>;
}

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [profileMember, setProfileMember] = useState<Member | null>(null);
  const [profileReceipts, setProfileReceipts] = useState<Receipt[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [checkInBusy, setCheckInBusy] = useState(false);

  const archivedIds = useMemo(
    () => new Set(loadJson<string[]>(ARCHIVED_KEY, [])),
    [members, showModal, profileMember],
  );

  const renewalLogs = useMemo(
    () => loadJson<RenewalLog[]>(RENEWALS_KEY, []),
    [members, profileMember],
  );

  const startJalali = todayJalali();
  const endJalali = useMemo(
    () => addJalaliMonths(startJalali, monthsForMembershipType(form.membership_type)),
    [form.membership_type],
  );

  useEffect(() => {
    fetchMembers();
    (async () => {
      const { data } = await getCoaches();
      setCoaches((data || []).filter((c) => c.is_active !== 0));
    })();
  }, []);

  const fetchMembers = async () => {
    setLoading(true);
    const { data, error } = await getMembers();
    if (error) console.error('fetchMembers error:', error);
    setMembers(data || []);
    setLoading(false);
  };

  const openProfile = async (m: Member) => {
    setProfileMember(m);
    setProfileReceipts([]);
    const [detail, receipts] = await Promise.all([getMemberById(m.id), getMemberReceipts(m.id)]);
    if (detail.data) setProfileMember(detail.data);
    if (receipts.data) setProfileReceipts(receipts.data);
  };

  const filteredMembers = members.filter((m) => {
    const q = search.toLowerCase();
    return (
      m.full_name.toLowerCase().includes(q) ||
      m.phone.includes(search) ||
      (m.personnel_code || '').toLowerCase().includes(q) ||
      (m.national_id || '').includes(search)
    );
  });

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (member: Member) => {
    const { first, last } = splitName(member.full_name);
    setEditing(member);
    setForm({
      first_name: first,
      last_name: last,
      phone: member.phone,
      national_id: member.national_id || '',
      membership_type: member.membership_type || 'monthly',
      birthday_jalali: parseBirthdayToJalali(member.birthday ?? ''),
      personnel_code: member.personnel_code || '',
      coach_id: member.coach_id != null ? String(member.coach_id) : '',
      coach_name: member.coach_name || '',
      monthly_fee: Number(member.monthly_fee) || 0,
      coach_commission_percent: Number(member.coach_commission_percent) || 0,
      weekly_sessions: member.weekly_sessions ?? 3,
      extras: {
        has_insurance: !!member.has_insurance,
        insurance_notes: member.insurance_notes || '',
        referrer_name: member.referrer_name || '',
        referral_source: member.referral_source || '',
        training_goal: member.training_goal || '',
        photo_url: member.photo_url || '',
      },
    });
    setFormError('');
    setShowModal(true);
  };

  const validate = (): string | null => {
    if (!form.first_name.trim()) return 'نام الزامی است';
    if (!form.last_name.trim()) return 'نام خانوادگی الزامی است';
    if (!form.phone.trim()) return 'شماره تماس الزامی است';
    if (!form.national_id.trim()) return 'کد ملی الزامی است';
    if (!isValidNationalId(form.national_id)) return 'کد ملی باید ۱۰ رقم معتبر باشد';
    if (!form.birthday_jalali) return 'تاریخ تولد الزامی است — از تقویم انتخاب کنید';
    if (!form.personnel_code.trim()) return 'کد پرسنلی (اثر انگشت) الزامی است';
    return null;
  };

  const buildPayload = (): MemberFormPayload => {
    const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`;
    let start_date: string;
    let end_date: string;

    if (editing) {
      start_date = editing.start_date || editing.end_date;
      if (form.membership_type === editing.membership_type) {
        end_date = editing.end_date;
      } else {
        end_date = jalaliToGregorianIso(
          addJalaliMonths(
            gregorianToJalali(editing.start_date || editing.end_date),
            monthsForMembershipType(form.membership_type),
          ),
        );
      }
    } else {
      start_date = jalaliToGregorianIso(todayJalali());
      end_date = jalaliToGregorianIso(
        addJalaliMonths(todayJalali(), monthsForMembershipType(form.membership_type)),
      );
    }

    return {
      full_name: fullName,
      phone: form.phone.trim(),
      membership_type: form.membership_type,
      weekly_sessions: form.weekly_sessions,
      total_sessions: form.weekly_sessions * 4,
      used_sessions: 0,
      start_date,
      end_date,
      birthday: birthdayToStorage(form.birthday_jalali),
      notes: '',
      personnel_code: form.personnel_code.trim(),
      coach_id: form.coach_id ? Number(form.coach_id) : null,
      coach_name: form.coach_name.trim(),
      national_id: form.national_id.trim(),
      monthly_fee: form.monthly_fee,
      coach_commission_percent: form.coach_commission_percent,
      has_insurance: form.extras.has_insurance,
      insurance_notes: form.extras.insurance_notes.trim(),
      referrer_name: form.extras.referrer_name.trim(),
      referral_source: form.extras.referral_source.trim(),
      training_goal: form.extras.training_goal.trim(),
      photo_url: form.extras.photo_url.trim(),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (editing) {
        const { error } = await updateMember(editing.id, payload);
        if (error) throw error;
      } else {
        const { error } = await addMember(payload);
        if (error) throw error;
      }
      setShowModal(false);
      setForm(emptyForm());
      setEditing(null);
      await fetchMembers();
    } catch (e2: unknown) {
      setFormError(getApiErrorMessage(e2));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('آیا از حذف این عضو مطمئن هستید؟')) return;
    const { error } = await deleteMember(id);
    if (error) alert(getApiErrorMessage(error));
    else fetchMembers();
  };

  const handleCheckIn = async (m: Member) => {
    if (!m.personnel_code) {
      alert('این عضو کد پرسنلی ندارد');
      return;
    }
    setCheckInBusy(true);
    const { error } = await recordAttendance({
      personnel_code: m.personnel_code,
      member_id: m.id,
      source: 'manual',
    });
    setCheckInBusy(false);
    if (error) alert(typeof error === 'string' ? error : getApiErrorMessage(error));
    else {
      await fetchMembers();
      if (profileMember?.id === m.id) await openProfile(m);
    }
  };

  const previewEnd = editing
    ? form.membership_type === editing.membership_type
      ? formatJalali(editing.end_date)
      : formatJalaliDisplay(
          addJalaliMonths(
            gregorianToJalali(editing.start_date || editing.end_date),
            monthsForMembershipType(form.membership_type),
          ),
        )
    : formatJalaliDisplay(endJalali);

  const previewStart = editing
    ? formatJalali(editing.start_date || editing.end_date)
    : formatJalaliDisplay(startJalali);

  const profileRenewalCount = profileMember
    ? renewalLogs.filter((l) => l.member_id === profileMember.id && l.status === 'completed').length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">اعضا</h1>
          <p className="page-subtitle">{members.length.toLocaleString('fa-IR')} عضو ثبت‌شده</p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary">
          <UserPlus size={16} />
          عضو جدید
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        <input className="input-field pr-10" placeholder="جستجو نام، تلفن، کد ملی یا پرسنلی..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="panel-card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 skeleton" />)}</div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-12 text-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>عضوی یافت نشد</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right min-w-[900px]">
              <thead>
                <tr style={{ background: 'var(--bg-muted)' }}>
                  {['نام', 'تلفن', 'کد پرسنلی', 'نوع عضویت', 'جلسات', 'پایان عضویت', 'وضعیت', ''].map((h) => (
                    <th key={h || 'a'} className="px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m) => {
                  const archived = archivedIds.has(m.id);
                  const st = getMembershipStatus(m.end_date, archived);
                  const rowClass =
                    st.kind === 'expired' || st.kind === 'archived'
                      ? 'table-row row-expired'
                      : st.kind === 'expiring_soon'
                        ? 'table-row row-expiring'
                        : 'table-row';
                  return (
                    <tr key={m.id} className={rowClass}>
                      <td className="px-4 py-3.5">
                        <button type="button" onClick={() => openProfile(m)} className="flex items-center gap-3 text-right hover:opacity-80">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0" style={{ background: st.kind === 'active' ? 'var(--accent-soft)' : 'var(--danger-soft)', color: st.kind === 'active' ? 'var(--accent)' : 'var(--danger)' }}>
                            {m.full_name?.charAt(0) || '?'}
                          </div>
                          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{m.full_name}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{m.phone}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-1 rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text)' }} dir="ltr">
                          <Fingerprint size={12} style={{ color: 'var(--accent)' }} />
                          {m.personnel_code || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5"><span className="badge badge-info">{membershipLabels[m.membership_type] || m.membership_type}</span></td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{(m.weekly_sessions ?? 0).toLocaleString('fa-IR')} / هفته</td>
                      <td className="px-4 py-3.5 text-sm font-medium" style={{ color: st.kind === 'active' ? 'var(--text-secondary)' : 'var(--danger)' }}>{formatJalali(m.end_date)}</td>
                      <td className="px-4 py-3.5"><StatusBadge endDate={m.end_date} archived={archived} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1 justify-end">
                          <button type="button" title="ثبت حضور" onClick={() => handleCheckIn(m)} className="p-2 rounded-lg" style={{ color: 'var(--success)' }}>
                            <CalendarCheck size={15} />
                          </button>
                          <button type="button" onClick={() => openProfile(m)} className="p-2 rounded-lg" style={{ color: 'var(--accent)' }}><Eye size={15} /></button>
                          <button type="button" onClick={() => openEdit(m)} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}><Pencil size={15} /></button>
                          <button type="button" onClick={() => handleDelete(m.id)} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{editing ? 'ویرایش عضو' : 'ثبت عضو جدید'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-xl" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>{formError}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>نام <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="input-field" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>نام خانوادگی <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="input-field" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>شماره تماس <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required dir="ltr" />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>کد ملی <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  className="input-field"
                  value={form.national_id}
                  onChange={(e) => setForm({ ...form, national_id: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  required
                  maxLength={10}
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="۱۰ رقم"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>کد پرسنلی / اثر انگشت <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="input-field" placeholder="همان کد دستگاه اثر انگشت" value={form.personnel_code} onChange={(e) => setForm({ ...form, personnel_code: e.target.value })} required dir="ltr" />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>مربی</label>
                <select
                  className="input-field"
                  value={form.coach_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const c = coaches.find((x) => String(x.id) === id);
                    setForm({
                      ...form,
                      coach_id: id,
                      coach_name: c ? c.full_name : '',
                      coach_commission_percent:
                        form.coach_commission_percent || (c ? Number(c.commission_percent) || 0 : 0),
                    });
                  }}
                >
                  <option value="">بدون مربی / انتخاب کنید</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}{c.specialty ? ` — ${c.specialty}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>هزینه ماهانه (تومان)</label>
                  <input type="number" min={0} className="input-field" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>درصد حق مربی</label>
                  <input type="number" min={0} max={100} className="input-field" value={form.coach_commission_percent} onChange={(e) => setForm({ ...form, coach_commission_percent: Number(e.target.value) || 0 })} />
                </div>
              </div>

              <JalaliDatePicker label="تاریخ تولد" value={form.birthday_jalali} onChange={(d) => setForm({ ...form, birthday_jalali: d })} required placeholder="انتخاب از تقویم شمسی" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>نوع عضویت</label>
                  <select className="input-field" value={form.membership_type} onChange={(e) => setForm({ ...form, membership_type: e.target.value as MembershipType })}>
                    {(Object.keys(membershipLabels) as MembershipType[]).map((k) => (
                      <option key={k} value={k}>{membershipLabels[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>جلسات هفتگی</label>
                  <input type="number" min={0} className="input-field" value={form.weekly_sessions} onChange={(e) => setForm({ ...form, weekly_sessions: Number(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm p-3 rounded-xl" style={{ background: 'var(--bg-muted)' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>شروع: </span>
                  <strong style={{ color: 'var(--text)' }}>{previewStart}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>پایان: </span>
                  <strong style={{ color: 'var(--text)' }}>{previewEnd}</strong>
                </div>
              </div>

              <ProfileExtrasFields value={form.extras} onChange={(extras) => setForm({ ...form, extras })} />
            </div>

            <div className="shrink-0 px-6 py-4 flex flex-row-reverse gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
              <button type="submit" className="btn-primary flex-1" disabled={submitting}>{submitting ? '...' : editing ? 'ذخیره' : 'ثبت عضو'}</button>
              <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>انصراف</button>
            </div>
          </form>
        </div>
      )}

      {profileMember && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15, 23, 42, 0.45)' }} onClick={(e) => e.target === e.currentTarget && setProfileMember(null)}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', maxHeight: '90vh' }}>
            <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg,#0c8ce7,#006fc5)' }}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 overflow-hidden flex items-center justify-center text-white text-lg font-bold">
                    {profileMember.photo_url ? (
                      <img src={profileMember.photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      profileMember.full_name.charAt(0)
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{profileMember.full_name}</h2>
                    <p className="text-white/70 text-sm" dir="ltr">{profileMember.phone}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setProfileMember(null)} className="text-white/80"><X size={18} /></button>
              </div>
            </div>
            <div className="p-5 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 120px)' }}>
              <ProfileRow label="کد ملی" value={profileMember.national_id || '—'} />
              <ProfileRow label="کد پرسنلی" value={profileMember.personnel_code || '—'} />
              <ProfileRow label="مربی" value={profileMember.coach_name || 'تعیین نشده'} />
              <ProfileRow label="شهریه ماهانه" value={`${(Number(profileMember.monthly_fee) || 0).toLocaleString('fa-IR')} تومان`} />
              <ProfileRow label="درصد حق مربی" value={`${(Number(profileMember.coach_commission_percent) || 0).toLocaleString('fa-IR')}%`} />
              <ProfileRow label="بیمه ورزشی" value={profileMember.has_insurance ? (profileMember.insurance_notes || 'دارد') : 'ندارد'} />
              <ProfileRow label="نام معرف" value={profileMember.referrer_name || '—'} />
              <ProfileRow label="منبع آشنایی" value={profileMember.referral_source || '—'} />
              <ProfileRow label="هدف تمرینی" value={profileMember.training_goal || '—'} />
              <ProfileRow label="نوع عضویت" value={membershipLabels[profileMember.membership_type] || profileMember.membership_type} />
              <ProfileRow label="پایان عضویت" value={formatJalali(profileMember.end_date)} />
              <ProfileRow label="تمدیدها" value={profileRenewalCount.toLocaleString('fa-IR')} />
              <ProfileRow label="حضورها" value={(profileMember.attendance_count || 0).toLocaleString('fa-IR')} />

              <div className="pt-2 space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>فیش‌های مالی</p>
                {profileReceipts.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>فیشی ثبت نشده</p>
                ) : (
                  profileReceipts.map((r) => (
                    <a
                      key={r.id}
                      href={receiptPublicUrl(r.token)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between p-2.5 rounded-xl text-xs"
                      style={{ background: 'var(--bg-muted)', color: 'var(--text)' }}
                    >
                      <span>
                        {r.type === 'renewal' ? 'تمدید' : 'ثبت‌نام'} — {Math.round(r.amount).toLocaleString('fa-IR')} تومان
                      </span>
                      <ExternalLink size={12} style={{ color: 'var(--accent)' }} />
                    </a>
                  ))
                )}
              </div>

              <div className="flex flex-col gap-2 pt-3">
                <PrintCardButton
                  data={{
                    full_name: profileMember.full_name,
                    phone: profileMember.phone,
                    personnel_code: profileMember.personnel_code,
                    membership_type: profileMember.membership_type,
                    end_date: profileMember.end_date,
                    coach_name: profileMember.coach_name,
                    photo_url: profileMember.photo_url,
                    role: 'member',
                  }}
                />
                <button
                  type="button"
                  className="btn-outline w-full"
                  disabled={checkInBusy || !profileMember.personnel_code}
                  onClick={() => handleCheckIn(profileMember)}
                >
                  <CalendarCheck size={14} />
                  {checkInBusy ? '...' : 'ثبت حضور دستی'}
                </button>
                <button type="button" className="btn-outline w-full" onClick={() => { setProfileMember(null); openEdit(profileMember); }}>
                  ویرایش
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 px-3 rounded-xl gap-3" style={{ background: 'var(--bg-muted)' }}>
      <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm font-medium text-left" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}
