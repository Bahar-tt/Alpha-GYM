import { useEffect, useMemo, useState } from 'react';
import {
  addMember,
  deleteMember,
  getMembers,
  getMemberById,
  updateMember,
  type MemberFormPayload,
  type MemberRecord,
  type MemberSportEntry,
  type MembershipType,
  parseMemberSports,
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
import CoachPicker from '../components/CoachPicker';
import {
  SPORTS,
  REFERRAL_SOURCES,
  TRAINING_GOALS,
  HEIGHT_OPTIONS,
  WEIGHT_OPTIONS,
  sportFee,
  sportLabel,
  matchCoachForSport,
  matchSportForCoach,
  calcAgeFromBirthday,
  calcBmi,
  bmiLabel,
} from '../lib/sports';
import {
  Pencil,
  Trash2,
  UserPlus,
  Plus,
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

interface SportRow {
  sport: string;
  coach_id: string;
  coach_name: string;
}

interface MemberForm {
  first_name: string;
  last_name: string;
  father_name: string;
  phone: string;
  national_id: string;
  membership_type: MembershipType;
  birthday_jalali: JalaliDate | null;
  personnel_code: string;
  sports: SportRow[];
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

const emptySportRow = (): SportRow => ({ sport: '', coach_id: '', coach_name: '' });

const emptyForm = (): MemberForm => ({
  first_name: '', last_name: '', father_name: '', phone: '', national_id: '',
  membership_type: 'monthly', birthday_jalali: null, personnel_code: '',
  sports: [emptySportRow()], weekly_sessions: 3, has_insurance: false,
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
  const computedFee = form.sports.reduce((sum, s) => sum + sportFee(s.sport), 0);
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
    const sportsList = (member.sports && member.sports.length
      ? member.sports
      : parseMemberSports({ sport: member.sport, coach_id: member.coach_id, coach_name: member.coach_name, sports_json: member.sports_json })
    ).map((s) => ({
      sport: s.sport || '',
      coach_id: s.coach_id != null ? String(s.coach_id) : '',
      coach_name: s.coach_name || '',
    }));
    setEditing(member);
    setForm({
      first_name: first, last_name: last, father_name: member.father_name || '', phone: member.phone,
      national_id: member.national_id || '', membership_type: member.membership_type || 'monthly',
      birthday_jalali: parseBirthdayToJalali(member.birthday ?? ''), personnel_code: member.personnel_code || '',
      sports: sportsList.length ? sportsList : [emptySportRow()],
      weekly_sessions: member.weekly_sessions ?? 3, has_insurance: !!member.has_insurance,
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
    if (!form.sports.some((s) => s.sport)) return 'حداقل یک رشته ورزشی را انتخاب کنید';
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
    const sportsPayload: MemberSportEntry[] = form.sports
      .filter((s) => s.sport)
      .map((s) => ({
        sport: s.sport,
        coach_id: s.coach_id ? Number(s.coach_id) : null,
        coach_name: s.coach_name.trim() || '',
      }));
    const primary = sportsPayload[0];
    return {
      full_name: fullName, phone: form.phone.trim(), membership_type: form.membership_type,
      weekly_sessions: form.weekly_sessions, total_sessions: form.weekly_sessions * 4, used_sessions: 0,
      start_date, end_date, birthday: birthdayToStorage(form.birthday_jalali), notes: '',
      personnel_code: form.personnel_code.trim(),
      coach_id: primary?.coach_id ?? null,
      coach_name: primary?.coach_name || '',
      national_id: form.national_id.trim(), father_name: form.father_name.trim(),
      sport: primary?.sport || '', sports: sportsPayload,
      monthly_fee: computedFee, has_insurance: form.has_insurance,
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
      <div
        className="page-hero flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
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
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{(m.sports && m.sports.length ? m.sports.map((s) => sportLabel(s.sport)).join(' + ') : sportLabel(m.sport))}</td>
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
          <form onSubmit={handleSubmit} className="w-full max-w-5xl rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', maxHeight: '92vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{editing ? 'ویرایش عضو' : 'ثبت عضو جدید'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
              {formError && <div className="col-span-full text-sm rounded-xl px-3 py-2" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>{formError}</div>}
              <SectionTitle>اطلاعات فردی</SectionTitle>
              <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
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
              <div className="col-span-full space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    رشته‌های ورزشی <span style={{ color: 'var(--danger)' }}>*</span>
                  </span>
                  <button
                    type="button"
                    className="btn-outline text-xs py-1 px-2 inline-flex items-center gap-1"
                    onClick={() => setForm({ ...form, sports: [...form.sports, emptySportRow()] })}
                  >
                    <Plus size={14} /> افزودن رشته
                  </button>
                </div>
                {form.sports.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl"
                    style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
                  >
                    <Field label={`رشته ${form.sports.length > 1 ? (idx + 1).toLocaleString('fa-IR') : ''}`} required={idx === 0}>
                      <select
                        className="input-field"
                        value={row.sport}
                        onChange={(e) => {
                          const sport = e.target.value;
                          const matched = matchCoachForSport(sport, coaches);
                          const next = form.sports.map((r, i) =>
                            i === idx
                              ? {
                                  sport,
                                  coach_id: matched ? matched.id : '',
                                  coach_name: matched ? matched.full_name : '',
                                }
                              : r,
                          );
                          setForm({ ...form, sports: next });
                        }}
                        required={idx === 0}
                      >
                        <option value="">انتخاب رشته</option>
                        {SPORTS.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Field label="نام مربی">
                          <CoachPicker
                            coaches={coaches}
                            valueId={row.coach_id}
                            displayName={row.coach_name}
                            onSelect={(c) => {
                              const next = form.sports.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      coach_id: c ? String(c.id) : '',
                                      coach_name: c ? c.full_name : '',
                                    }
                                  : r,
                              );
                              setForm({ ...form, sports: next });
                            }}
                          />
                        </Field>
                      </div>
                      {form.sports.length > 1 && (
                        <button
                          type="button"
                          title="حذف رشته"
                          className="p-2 rounded-lg mb-0.5"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => setForm({ ...form, sports: form.sports.filter((_, i) => i !== idx) })}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    {row.sport ? (
                      <p className="sm:col-span-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        شهریه این رشته: {sportFee(row.sport).toLocaleString('fa-IR')} تومان
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              <Field label="نوع عضویت">
                <select className="input-field" value={form.membership_type} onChange={(e) => setForm({ ...form, membership_type: e.target.value as MembershipType })}>
                  {(Object.keys(membershipLabels) as MembershipType[]).map((k) => <option key={k} value={k}>{membershipLabels[k]}</option>)}
                </select>
              </Field>
              <Field label="جلسات هفتگی"><input type="number" min={1} max={14} className="input-field" value={form.weekly_sessions} onChange={(e) => setForm({ ...form, weekly_sessions: Number(e.target.value) || 1 })} /></Field>
              <Field label="تاریخ شروع"><input className="input-field" readOnly value={previewStart} style={{ opacity: 0.85 }} /></Field>
              <Field label="تاریخ پایان"><input className="input-field" readOnly value={previewEnd} style={{ opacity: 0.85 }} /></Field>
              <Field label="مبلغ شهریه (تومان)"><input className="input-field" readOnly value={computedFee ? computedFee.toLocaleString('fa-IR') : '—'} style={{ opacity: 0.85 }} /></Field>
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
              <Field label="BMI"><input className="input-field" readOnly value={bmiLabel(bmi)} style={{ opacity: 0.85 }} /></Field>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" id="ins" checked={form.has_insurance} onChange={(e) => setForm({ ...form, has_insurance: e.target.checked })} />
                <label htmlFor="ins" className="text-sm" style={{ color: 'var(--text)' }}>بیمه ورزشی دارد</label>
              </div>

              <SectionTitle>اطلاعات تکمیلی</SectionTitle>
              <Field label="نام معرف"><input className="input-field" value={form.referrer_name} onChange={(e) => setForm({ ...form, referrer_name: e.target.value })} /></Field>
              <Field label="منبع آشنایی">
                <select className="input-field" value={form.referral_source} onChange={(e) => setForm({ ...form, referral_source: e.target.value })}>
                  <option value="">انتخاب</option>
                  {REFERRAL_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>هدف تمرینی</label>
                <div className="flex flex-wrap gap-2">
                  {TRAINING_GOALS.map((g) => (
                    <button key={g} type="button" onClick={() => toggleGoal(g)} className="text-xs px-2.5 py-1 rounded-lg border" style={{ borderColor: form.training_goals.includes(g) ? 'var(--accent)' : 'var(--border)', background: form.training_goals.includes(g) ? 'var(--accent-soft)' : 'transparent', color: 'var(--text)' }}>{g}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button type="button" onClick={() => setShowModal(false)} className="btn-outline">انصراف</button>
              <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'در حال ذخیره...' : editing ? 'ذخیره تغییرات' : 'ثبت عضو'}</button>
            </div>
          </form>
        </div>
      )}

      {profileMember && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3" style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)' }} onClick={(e) => { if (e.target === e.currentTarget) setProfileMember(null); }}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>پروفایل عضو</h2>
              <div className="flex gap-2">
                <button type="button" className="btn-outline text-xs" onClick={() => { setCardTarget(profileMember); }}><Printer size={14} /> کارت</button>
                <button type="button" className="btn-outline text-xs" onClick={() => { openEdit(profileMember); setProfileMember(null); }}><Pencil size={14} /> ویرایش</button>
                <button type="button" onClick={() => setProfileMember(null)} className="p-1.5" style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto space-y-4" style={{ maxHeight: 'calc(90vh - 70px)' }}>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center text-xl font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  {profileMember.photo_url ? <img src={profileMember.photo_url} alt="" className="w-full h-full object-cover" /> : (profileMember.full_name?.charAt(0) || '?')}
                </div>
                <div>
                  <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>{profileMember.full_name}</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{profileMember.phone}</div>
                  <span className="px-3 py-1 rounded-full text-xs" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{sportLabel(profileMember.sport)}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <PRow label="نام پدر" value={profileMember.father_name || '—'} />
                <PRow label="کد ملی" value={profileMember.national_id || '—'} />
                <PRow label="کد پرسنلی" value={profileMember.personnel_code || '—'} />
                <PRow label="تاریخ تولد" value={profileMember.birthday || '—'} />
                <PRow label="مربی" value={profileMember.coach_name || 'تعیین نشده'} />
                <PRow label="رشته" value={(profileMember.sports && profileMember.sports.length
                  ? profileMember.sports.map((s) => sportLabel(s.sport)).join(' + ')
                  : sportLabel(profileMember.sport))} />
                <PRow label="نوع عضویت" value={membershipLabels[profileMember.membership_type] || profileMember.membership_type} />
                <PRow label="پایان عضویت" value={formatJalali(profileMember.end_date)} />
                <PRow label="شهریه" value={profileMember.monthly_fee ? Number(profileMember.monthly_fee).toLocaleString('fa-IR') : '—'} />
                <PRow label="قد / وزن" value={`${profileMember.height_cm || '—'} cm / ${profileMember.weight_kg || '—'} kg`} />
                <PRow label="بیمه" value={profileMember.has_insurance ? 'دارد' : 'ندارد'} />
                <PRow label="معرف" value={profileMember.referrer_name || '—'} />
                <PRow label="منبع آشنایی" value={profileMember.referral_source || '—'} />
                <PRow label="هدف" value={profileMember.training_goal || '—'} />
                <PRow label="تعداد تمدید" value={String(profileRenewalCount)} />
                <PRow label="تعداد حضور" value={String(profileMember.attendance_count ?? 0)} />
              </div>
              {profileReceipts.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>فیش‌ها</h3>
                  <ul className="space-y-1">
                    {profileReceipts.map((r) => (
                      <li key={r.id} className="text-sm flex justify-between gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <span>{r.type} — {Number(r.amount || 0).toLocaleString('fa-IR')} تومان</span>
                        <a href={receiptPublicUrl(r.public_token)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}><ExternalLink size={12} /> مشاهده</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {cardTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }} onClick={(e) => { if (e.target === e.currentTarget) setCardTarget(null); }}>
          <div className="bg-white rounded-2xl p-4 max-w-md w-full">
            <div className="flex justify-between mb-3">
              <span className="font-bold">کارت عضویت</span>
              <button type="button" onClick={() => setCardTarget(null)}><X size={18} /></button>
            </div>
            <MembershipCard
              data={{
                fullName: cardTarget.full_name,
                fatherName: cardTarget.father_name || '',
                nationalId: cardTarget.national_id || '',
                personnelCode: cardTarget.personnel_code || '',
                birthday: cardTarget.birthday || '',
                membershipType: membershipLabels[cardTarget.membership_type] || cardTarget.membership_type,
                endDate: formatJalali(cardTarget.end_date),
                coachName: cardTarget.coach_name || '',
                photoUrl: cardTarget.photo_url || '',
                role: 'member',
              }}
            />
            <button type="button" className="btn-primary w-full mt-3" onClick={() => window.print()}>چاپ</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-2 px-3 rounded-xl" style={{ background: 'var(--bg-muted)' }}>
      <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm font-medium text-left" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}
