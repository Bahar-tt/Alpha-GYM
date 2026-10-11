import { useEffect, useMemo, useState } from 'react';
import {
  addMember,
  deleteMember,
  getMembers,
  getMemberById,
  updateMember,
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
import MembershipCard from '../components/MembershipCard';
import {
  SPORTS,
  REFERRAL_SOURCES,
  TRAINING_GOALS,
  HEIGHT_OPTIONS,
  WEIGHT_OPTIONS,
  sportFee,
  sportLabel,
  calcAgeFromBirthday,
  calcBmi,
  bmiLabel,
} from '../lib/sports';
import {
  Pencil,
  Trash2,
  UserPlus,
  Search,
  X,
  Eye,
  Fingerprint,
  ExternalLink,
  CreditCard,
  Camera,
  Printer,
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
  father_name: string;
  phone: string;
  national_id: string;
  membership_type: MembershipType;
  birthday_jalali: JalaliDate | null;
  personnel_code: string;
  coach_id: string;
  coach_name: string;
  sport: string;
  weekly_sessions: number;
  has_insurance: boolean;
  height_cm: number;
  weight_kg: number;
  referrer_name: string;
  referral_source: string;
  training_goals: string[];
  photo_url: string;
}

interface RenewalLog { member_id: string; status: string }

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
    try { return gregorianToJalali(s); } catch { return null; }
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
  first_name: '', last_name: '', father_name: '', phone: '', national_id: '',
  membership_type: 'monthly', birthday_jalali: null, personnel_code: '',
  coach_id: '', coach_name: '', sport: '', weekly_sessions: 3, has_insurance: false,
  height_cm: 0, weight_kg: 0, referrer_name: '', referral_source: '', training_goals: [], photo_url: '',
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
  if (st.kind === 'expired') return <Link to="/renewals" className="badge badge-danger hover:opacity-90">{st.label}</Link>;
  if (st.kind === 'archived') return <span className="badge badge-warning">{st.label}</span>;
  return <span className="badge badge-info">{st.label}</span>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-bold col-span-full pt-2 pb-1" style={{ color: 'var(--accent)', borderBottom: '1px solid var(--border)' }}>{children}</h3>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        {label}{required && <span style={{ color: 'var(--danger)' }}> *</span>}
      </label>
      {children}
    </div>
  );
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
  const [cardTarget, setCardTarget] = useState<Member | null>(null);

  const archivedIds = useMemo(() => new Set(loadJson<string[]>(ARCHIVED_KEY, [])), [members, showModal, profileMember]);
  const renewalLogs = useMemo(() => loadJson<RenewalLog[]>(RENEWALS_KEY, []), [members, profileMember]);
  const startJalali = todayJalali();
  const endJalali = useMemo(() => addJalaliMonths(startJalali, monthsForMembershipType(form.membership_type)), [form.membership_type]);
  const computedFee = sportFee(form.sport);
  const birthdayStr = birthdayToStorage(form.birthday_jalali);
  const age = calcAgeFromBirthday(birthdayStr);
  const bmi = calcBmi(form.height_cm, form.weight_kg);

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
    if (error) console.error(error);
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
    return m.full_name.toLowerCase().includes(q) || m.phone.includes(search) || (m.personnel_code || '').toLowerCase().includes(q) || (m.national_id || '').includes(search);
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setFormError(''); setShowModal(true); };

  const openEdit = (member: Member) => {
    const { first, last } = splitName(member.full_name);
    setEditing(member);
    setForm({
      first_name: first, last_name: last, father_name: member.father_name || '', phone: member.phone,
      national_id: member.national_id || '', membership_type: member.membership_type || 'monthly',
      birthday_jalali: parseBirthdayToJalali(member.birthday ?? ''), personnel_code: member.personnel_code || '',
      coach_id: member.coach_id != null ? String(member.coach_id) : '', coach_name: member.coach_name || '',
      sport: member.sport || '', weekly_sessions: member.weekly_sessions ?? 3, has_insurance: !!member.has_insurance,
      height_cm: Number(member.height_cm) || 0, weight_kg: Number(member.weight_kg) || 0,
      referrer_name: member.referrer_name || '', referral_source: member.referral_source || '',
      training_goals: member.training_goal ? member.training_goal.split(',').map((s) => s.trim()).filter(Boolean) : [],
      photo_url: member.photo_url || '',
    });
    setFormError('');
    setShowModal(true);
  };

  const onPhotoFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { setFormError('حجم عکس حداکثر ۱.۵ مگابایت'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, photo_url: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  const toggleGoal = (g: string) => {
    setForm((f) => {
      const has = f.training_goals.includes(g);
      return { ...f, training_goals: has ? f.training_goals.filter((x) => x !== g) : [...f.training_goals, g] };
    });
  };

  const validate = (): string | null => {
    if (!form.first_name.trim()) return 'نام الزامی است';
    if (!form.last_name.trim()) return 'نام خانوادگی الزامی است';
    if (!form.phone.trim()) return 'شماره تماس الزامی است';
    if (!form.national_id.trim()) return 'کد ملی الزامی است';
    if (!isValidNationalId(form.national_id)) return 'کد ملی باید ۱۰ رقم معتبر باشد';
    if (!form.birthday_jalali) return 'تاریخ تولد الزامی است';
    if (!form.personnel_code.trim()) return 'کد پرسنلی الزامی است';
    if (!form.sport) return 'رشته ورزشی را انتخاب کنید';
    return null;
  };

  const buildPayload = (): MemberFormPayload => {
    const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`;
    let start_date: string;
    let end_date: string;
    if (editing) {
      start_date = editing.start_date || editing.end_date;
      if (form.membership_type === editing.membership_type) end_date = editing.end_date;
      else end_date = jalaliToGregorianIso(addJalaliMonths(gregorianToJalali(editing.start_date || editing.end_date), monthsForMembershipType(form.membership_type)));
    } else {
      start_date = jalaliToGregorianIso(todayJalali());
      end_date = jalaliToGregorianIso(addJalaliMonths(todayJalali(), monthsForMembershipType(form.membership_type)));
    }
    return {
      full_name: fullName, phone: form.phone.trim(), membership_type: form.membership_type,
      weekly_sessions: form.weekly_sessions, total_sessions: form.weekly_sessions * 4, used_sessions: 0,
      start_date, end_date, birthday: birthdayToStorage(form.birthday_jalali), notes: '',
      personnel_code: form.personnel_code.trim(), coach_id: form.coach_id ? Number(form.coach_id) : null,
      coach_name: form.coach_name.trim(), national_id: form.national_id.trim(), father_name: form.father_name.trim(),
      sport: form.sport, monthly_fee: computedFee, has_insurance: form.has_insurance,
      height_cm: form.height_cm || 0, weight_kg: form.weight_kg || 0,
      referrer_name: form.referrer_name.trim(), referral_source: form.referral_source.trim(),
      training_goal: form.training_goals.join(', '), photo_url: form.photo_url.trim(),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const err = validate();
    if (err) { setFormError(err); return; }
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (editing) { const { error } = await updateMember(editing.id, payload); if (error) throw error; }
      else { const { error } = await addMember(payload); if (error) throw error; }
      setShowModal(false); setForm(emptyForm()); setEditing(null); await fetchMembers();
    } catch (e2: unknown) { setFormError(getApiErrorMessage(e2)); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('آیا از حذف این عضو مطمئن هستید؟')) return;
    const { error } = await deleteMember(id);
    if (error) alert(getApiErrorMessage(error)); else fetchMembers();
  };

  const previewEnd = editing
    ? form.membership_type === editing.membership_type ? formatJalali(editing.end_date)
      : formatJalaliDisplay(addJalaliMonths(gregorianToJalali(editing.start_date || editing.end_date), monthsForMembershipType(form.membership_type)))
    : formatJalaliDisplay(endJalali);
  const previewStart = editing ? formatJalali(editing.start_date || editing.end_date) : formatJalaliDisplay(startJalali);
  const profileRenewalCount = profileMember ? renewalLogs.filter((l) => l.member_id === profileMember.id && l.status === 'completed').length : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">اعضا</h1>
          <p className="page-subtitle">{members.length.toLocaleString('fa-IR')} عضو ثبت‌شده</p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary"><UserPlus size={16} /> عضو جدید</button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        <input className="input-field pr-10" placeholder="جستجو نام، تلفن، کد ملی یا پرسنلی..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="panel-card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[1,2,3,4].map((i) => <div key={i} className="h-12 skeleton" />)}</div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-12 text-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>عضوی یافت نشد</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right min-w-[900px]">
              <thead>
                <tr style={{ background: 'var(--bg-muted)' }}>
                  {['نام','تلفن','کد پرسنلی','رشته','پایان عضویت','وضعیت',''].map((h) => (
                    <th key={h||'a'} className="px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m) => {
                  const archived = archivedIds.has(m.id);
                  const st = getMembershipStatus(m.end_date, archived);
                  const rowClass = st.kind === 'expired' || st.kind === 'archived' ? 'table-row row-expired' : st.kind === 'expiring_soon' ? 'table-row row-expiring' : 'table-row';
                  return (
                    <tr key={m.id} className={rowClass}>
                      <td className="px-4 py-3.5">
                        <button type="button" onClick={() => openProfile(m)} className="flex items-center gap-3 text-right hover:opacity-80">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden" style={{ background: st.kind === 'active' ? 'var(--accent-soft)' : 'var(--danger-soft)', color: st.kind === 'active' ? 'var(--accent)' : 'var(--danger)' }}>
                            {m.photo_url ? <img src={m.photo_url} alt="" className="w-full h-full object-cover" /> : (m.full_name?.charAt(0) || '?')}
                          </div>
                          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{m.full_name}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{m.phone}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-1 rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text)' }} dir="ltr">
                          <Fingerprint size={12} style={{ color: 'var(--accent)' }} />{m.personnel_code || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{sportLabel(m.sport)}</td>
                      <td className="px-4 py-3.5 text-sm font-medium" style={{ color: st.kind === 'active' ? 'var(--text-secondary)' : 'var(--danger)' }}>{formatJalali(m.end_date)}</td>
                      <td className="px-4 py-3.5"><StatusBadge endDate={m.end_date} archived={archived} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1 justify-end">
                          <button type="button" title="مشاهده" onClick={() => openProfile(m)} className="p-2 rounded-lg" style={{ color: 'var(--accent)' }}><Eye size={15} /></button>
                          <button type="button" title="صدور کارت" onClick={() => setCardTarget(m)} className="p-2 rounded-lg" style={{ color: '#d4a843' }}><CreditCard size={15} /></button>
                          <button type="button" title="ویرایش" onClick={() => openEdit(m)} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}><Pencil size={15} /></button>
                          <button type="button" title="حذف" onClick={() => handleDelete(m.id)} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}><Trash2 size={15} /></button>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4" style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)' }} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <form onSubmit={handleSubmit} className="w-full max-w-5xl rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', maxHeight: '94vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{editing ? 'ویرایش عضو' : 'ثبت عضو جدید'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-xl" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {formError && <div className="p-3 rounded-xl text-sm mb-4" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>{formError}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <SectionTitle>اطلاعات فردی</SectionTitle>
                <div className="col-span-full sm:col-span-2 lg:col-span-1 flex flex-col items-center gap-2">
                  <div className="w-24 h-28 rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: 'var(--bg-muted)', border: '1px dashed var(--border)' }}>
                    {form.photo_url ? <img src={form.photo_url} alt="" className="w-full h-full object-cover" /> : <Camera size={28} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                  <label className="btn-outline text-xs py-1.5 cursor-pointer">بارگذاری عکس<input type="file" accept="image/*" className="hidden" onChange={(e) => onPhotoFile(e.target.files?.[0] || null)} /></label>
                </div>
                <Field label="نام" required><input className="input-field" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></Field>
                <Field label="نام خانوادگی" required><input className="input-field" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></Field>
                <Field label="نام پدر"><input className="input-field" value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} /></Field>
                <Field label="شماره تماس" required><input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required dir="ltr" /></Field>
                <Field label="کد ملی" required><input className="input-field" value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value.replace(/\D/g, '').slice(0, 10) })} required maxLength={10} dir="ltr" /></Field>
                <div className="sm:col-span-2"><JalaliDatePicker label="تاریخ تولد" value={form.birthday_jalali} onChange={(d) => setForm({ ...form, birthday_jalali: d })} required placeholder="تقویم شمسی" /></div>
                <Field label="سن (محاسبه‌شده)"><input className="input-field" readOnly value={age != null ? `${age.toLocaleString('fa-IR')} سال` : '—'} style={{ opacity: 0.85 }} /></Field>
                <Field label="کد پرسنلی" required><input className="input-field" value={form.personnel_code} onChange={(e) => setForm({ ...form, personnel_code: e.target.value })} required dir="ltr" /></Field>

                <SectionTitle>اطلاعات ورزشی</SectionTitle>
                <Field label="مربی">
                  <select className="input-field" value={form.coach_id} onChange={(e) => { const id = e.target.value; const c = coaches.find((x) => String(x.id) === id); setForm({ ...form, coach_id: id, coach_name: c ? c.full_name : '' }); }}>
                    <option value="">انتخاب مربی</option>
                    {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.specialty ? ` — ${c.specialty}` : ''}</option>)}
                  </select>
                </Field>
                <Field label="رشته ورزشی" required>
                  <select className="input-field" value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })} required>
                    <option value="">انتخاب رشته</option>
                    {SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="نوع عضویت">
                  <select className="input-field" value={form.membership_type} onChange={(e) => setForm({ ...form, membership_type: e.target.value as MembershipType })}>
                    {(Object.keys(membershipLabels) as MembershipType[]).map((k) => <option key={k} value={k}>{membershipLabels[k]}</option>)}
                  </select>
                </Field>
                <Field label="جلسات هفتگی"><input type="number" min={0} className="input-field" value={form.weekly_sessions} onChange={(e) => setForm({ ...form, weekly_sessions: Number(e.target.value) || 0 })} /></Field>
                <Field label="تاریخ شروع"><input className="input-field" readOnly value={previewStart} style={{ opacity: 0.85 }} /></Field>
                <Field label="تاریخ پایان"><input className="input-field" readOnly value={previewEnd} style={{ opacity: 0.85 }} /></Field>
                <Field label="مبلغ شهریه (تومان)"><input className="input-field font-bold" readOnly value={computedFee ? computedFee.toLocaleString('fa-IR') : '—'} style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }} /></Field>
                <Field label="بیمه ورزشی">
                  <select className="input-field" value={form.has_insurance ? '1' : '0'} onChange={(e) => setForm({ ...form, has_insurance: e.target.value === '1' })}>
                    <option value="0">ندارد</option><option value="1">دارد</option>
                  </select>
                </Field>
                <Field label="قد (سانتی‌متر)">
                  <select className="input-field" value={form.height_cm || ''} onChange={(e) => setForm({ ...form, height_cm: Number(e.target.value) || 0 })}>
                    <option value="">انتخاب</option>
                    {HEIGHT_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </Field>
                <Field label="وزن (کیلوگرم)">
                  <select className="input-field" value={form.weight_kg || ''} onChange={(e) => setForm({ ...form, weight_kg: Number(e.target.value) || 0 })}>
                    <option value="">انتخاب</option>
                    {WEIGHT_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </Field>
                <Field label="BMI (محاسبه‌شده)"><input className="input-field" readOnly value={bmiLabel(bmi)} style={{ opacity: 0.85 }} /></Field>

                <SectionTitle>اطلاعات تکمیلی</SectionTitle>
                <Field label="نام معرف"><input className="input-field" value={form.referrer_name} onChange={(e) => setForm({ ...form, referrer_name: e.target.value })} /></Field>
                <Field label="منبع آشنایی">
                  <select className="input-field" value={form.referral_source} onChange={(e) => setForm({ ...form, referral_source: e.target.value })}>
                    <option value="">انتخاب کنید</option>
                    {REFERRAL_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <div className="col-span-full">
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>هدف تمرینی (چند انتخابی)</p>
                  <div className="flex flex-wrap gap-2">
                    {TRAINING_GOALS.map((g) => {
                      const on = form.training_goals.includes(g);
                      return (
                        <button key={g} type="button" onClick={() => toggleGoal(g)} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: on ? 'var(--accent)' : 'var(--bg-muted)', color: on ? '#fff' : 'var(--text)', border: on ? '1px solid transparent' : '1px solid var(--border)' }}>{g}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="shrink-0 px-6 py-4 flex flex-row-reverse gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
              <button type="submit" className="btn-primary flex-1" disabled={submitting}>{submitting ? '...' : editing ? 'ذخیره' : 'ثبت عضو'}</button>
              <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>انصراف</button>
            </div>
          </form>
        </div>
      )}

      {profileMember && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(8px)' }} onClick={(e) => e.target === e.currentTarget && setProfileMember(null)}>
          <div className="w-full max-w-3xl rounded-3xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', maxHeight: '94vh', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
            <div className="relative px-6 pt-8 pb-6" style={{ background: 'linear-gradient(135deg,#0c8ce7 0%,#006fc5 50%,#0b3d66 100%)' }}>
              <button type="button" onClick={() => setProfileMember(null)} className="absolute top-4 left-4 p-2 rounded-xl bg-white/15 text-white"><X size={18} /></button>
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="w-28 h-32 rounded-2xl overflow-hidden bg-white/20 border-2 border-white/30 flex items-center justify-center text-4xl font-bold text-white shrink-0">
                  {profileMember.photo_url ? <img src={profileMember.photo_url} alt="" className="w-full h-full object-cover" /> : profileMember.full_name.charAt(0)}
                </div>
                <div className="text-center sm:text-right text-white flex-1">
                  <h2 className="text-2xl font-extrabold">{profileMember.full_name}</h2>
                  <p className="text-white/80 text-sm mt-1" dir="ltr">{profileMember.phone}</p>
                  <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                    <span className="px-3 py-1 rounded-full text-xs bg-white/20">{sportLabel(profileMember.sport)}</span>
                    <span className="px-3 py-1 rounded-full text-xs bg-white/20">{membershipLabels[profileMember.membership_type] || profileMember.membership_type}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5" style={{ maxHeight: 'calc(94vh - 200px)' }}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="سن" value={calcAgeFromBirthday(profileMember.birthday || '') != null ? `${calcAgeFromBirthday(profileMember.birthday || '')} سال` : '—'} />
                <Stat label="BMI" value={bmiLabel(calcBmi(Number(profileMember.height_cm) || 0, Number(profileMember.weight_kg) || 0))} />
                <Stat label="تمدیدها" value={profileRenewalCount.toLocaleString('fa-IR')} />
                <Stat label="حضورها" value={(profileMember.attendance_count || 0).toLocaleString('fa-IR')} />
              </div>
              <div>
                <h4 className="text-xs font-bold mb-2" style={{ color: 'var(--accent)' }}>اطلاعات فردی</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <PRow label="نام پدر" value={profileMember.father_name || '—'} />
                  <PRow label="کد ملی" value={profileMember.national_id || '—'} />
                  <PRow label="کد پرسنلی" value={profileMember.personnel_code || '—'} />
                  <PRow label="تاریخ تولد" value={profileMember.birthday || '—'} />
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold mb-2" style={{ color: 'var(--accent)' }}>اطلاعات ورزشی</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <PRow label="مربی" value={profileMember.coach_name || 'تعیین نشده'} />
                  <PRow label="رشته" value={sportLabel(profileMember.sport)} />
                  <PRow label="شهریه" value={`${(Number(profileMember.monthly_fee) || 0).toLocaleString('fa-IR')} تومان`} />
                  <PRow label="جلسات هفتگی" value={(profileMember.weekly_sessions ?? 0).toLocaleString('fa-IR')} />
                  <PRow label="شروع" value={formatJalali(profileMember.start_date || profileMember.end_date)} />
                  <PRow label="پایان" value={formatJalali(profileMember.end_date)} />
                  <PRow label="بیمه" value={profileMember.has_insurance ? 'دارد' : 'ندارد'} />
                  <PRow label="قد / وزن" value={`${profileMember.height_cm || '—'} cm / ${profileMember.weight_kg || '—'} kg`} />
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold mb-2" style={{ color: 'var(--accent)' }}>اطلاعات تکمیلی</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <PRow label="نام معرف" value={profileMember.referrer_name || '—'} />
                  <PRow label="منبع آشنایی" value={profileMember.referral_source || '—'} />
                  <div className="sm:col-span-2"><PRow label="اهداف تمرینی" value={profileMember.training_goal || '—'} /></div>
                </div>
              </div>
              {profileReceipts.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold mb-2" style={{ color: 'var(--accent)' }}>فیش‌های مالی</h4>
                  <div className="space-y-1.5">
                    {profileReceipts.map((r) => (
                      <a key={r.id} href={receiptPublicUrl(r.token)} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2.5 rounded-xl text-xs" style={{ background: 'var(--bg-muted)', color: 'var(--text)' }}>
                        <span>{r.type === 'renewal' ? 'تمدید' : 'ثبت‌نام'} — {Math.round(r.amount).toLocaleString('fa-IR')} تومان</span>
                        <ExternalLink size={12} style={{ color: 'var(--accent)' }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <button type="button" className="btn-outline w-full" onClick={() => { setProfileMember(null); openEdit(profileMember); }}>ویرایش عضو</button>
            </div>
          </div>
        </div>
      )}

      {cardTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.5)' }} onClick={(e) => e.target === e.currentTarget && setCardTarget(null)}>
          <div className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="flex justify-between items-center">
              <h3 className="font-bold" style={{ color: 'var(--text)' }}>صدور کارت عضویت</h3>
              <button type="button" onClick={() => setCardTarget(null)}><X size={18} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <MembershipCard data={{ full_name: cardTarget.full_name, father_name: cardTarget.father_name, national_id: cardTarget.national_id, personnel_code: cardTarget.personnel_code, birthday: cardTarget.birthday, membership_type: cardTarget.membership_type, end_date: cardTarget.end_date, photo_url: cardTarget.photo_url, role: 'member' }} />
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1" onClick={() => window.print()}><Printer size={16} /> چاپ</button>
              <button type="button" className="btn-outline" onClick={() => setCardTarget(null)}>بستن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--bg-muted)' }}>
      <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

function PRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5 px-3 rounded-xl gap-3" style={{ background: 'var(--bg-muted)' }}>
      <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm font-medium text-left" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}
