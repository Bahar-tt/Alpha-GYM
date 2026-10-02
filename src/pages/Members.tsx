import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';


import {
  addMember, deleteMember, getMembers, updateMember,
  type MemberFormPayload, type MemberRecord, type MembershipType,
  type FeeBasis, type ClassType, type SportEnrollment,
} from '../services/memberService';
import { getApiErrorMessage } from '../lib/errors';
import { apiGet, API_BASE } from '../services/api';
import {
  addJalaliMonths, compareJalali, formatJalali, jalaliDaysInMonth,
  jalaliMonthNames, jalaliToGregorianIso, gregorianToJalali, todayJalali, type JalaliDate,
} from '../lib/jalaliDate';
import { CreditCard as Edit2, Trash2, UserPlus, RefreshCcw, Download, X, Plus, Printer, Receipt } from 'lucide-react';
import { GOAL_KEYS, GOAL_LABELS } from '../lib/goals';

interface SportForm {
  key: string;            // '' | 'custom' | 'sport::n'
  sport: string;          // نام رشته (از پلن یا دستی)
  weekly_sessions: number;
  total_sessions: number;
  used_sessions: number;
  tuition_amount: number | null;
  fee_basis: FeeBasis;
  class_type: ClassType;
  end_date_jalali: JalaliDate;
}

interface MemberForm {
  full_name: string; phone: string; membership_type: MembershipType;
  birthday: JalaliDate | null; notes: string;
  national_id: string; referrer: string; has_insurance: boolean;
  goal: string;
  member_code: string;
  start_date_jalali: JalaliDate;
  sports: SportForm[];
}

type Member = MemberRecord;

const membershipLabels: Record<MembershipType, string> = {
  monthly: 'ماهانه', quarterly: 'جلسه‌ای', yearly: 'جلسه‌ای خصوصی', vip: 'VIP',
};

interface SportPlan { label: string; sessions: number; price: number; }

const SPORT_PLANS: Record<string, SportPlan[]> = {
  'بدنسازی': [
    { label: '۸ جلسه', sessions: 8, price: 850000 },
    { label: '۱۲ جلسه', sessions: 12, price: 1000000 },
    { label: '۱۶ جلسه', sessions: 16, price: 1200000 },
    { label: '۲۴ جلسه', sessions: 24, price: 1500000 },
  ],
  'کراس‌فیت':          [{ label: '۱۲ جلسه', sessions: 12, price: 1200000 }],
  'فانکشنال فیتنس':    [{ label: '۱۲ جلسه', sessions: 12, price: 800000 }],
  'فری‌استایل':        [{ label: '۱۲ جلسه', sessions: 12, price: 800000 }],
  'بادی‌پامپ':         [{ label: '۱۲ جلسه', sessions: 12, price: 1000000 }],
  'های‌روکس':          [{ label: '۱۲ جلسه', sessions: 12, price: 1000000 }],
  'اریال':             [{ label: '۱۲ جلسه', sessions: 12, price: 1000000 }],
  'بوکس':              [{ label: '۱۲ جلسه', sessions: 12, price: 950000 }],
  'TRX':               [{ label: '۱۲ جلسه', sessions: 12, price: 850000 }],
  'زومبا':             [{ label: '۱۲ جلسه', sessions: 12, price: 800000 }],
  'رقص ایرانی':        [{ label: '۱۲ جلسه', sessions: 12, price: 800000 }],
  'یوگا':              [{ label: '۱۲ جلسه', sessions: 12, price: 800000 }],
  'ایروفیتنس':         [{ label: '۱۲ جلسه', sessions: 12, price: 800000 }],
  'پیلاتس':            [{ label: '۱۲ جلسه', sessions: 12, price: 800000 }],
};

const SPORT_PLAN_OPTIONS = Object.entries(SPORT_PLANS).flatMap(([sport, plans]) =>
  plans.map((plan) => ({
    key: `${sport}::${plan.sessions}`,
    label: `${sport} - ${plan.label} (${plan.price.toLocaleString('fa-IR')} تومان)`,
    sport,
    plan,
  })),
);

function formatToman(n: number): string { return n.toLocaleString('fa-IR') + ' تومان'; }

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toEnDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

function isValidNationalId(id: string): boolean {
  if (!/^\d{10}$/.test(id)) return false;
  if (/^(\d)\1{9}$/.test(id)) return false;
  const digits = id.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  const r = sum % 11;
  const check = r < 2 ? r : 11 - r;
  return check === digits[9];
}

function findPlanKey(sport: string | null | undefined, sessions: number | null | undefined): string {
  const s = (sport || '').trim();
  const ss = sessions ?? 0;
  const opt = SPORT_PLAN_OPTIONS.find((o) => o.sport === s && o.plan.sessions === ss);
  return opt ? opt.key : (s ? 'custom' : '');
}

function makeEmptySport(end: JalaliDate): SportForm {
  return {
    key: '', sport: '', weekly_sessions: 3, total_sessions: 12, used_sessions: 0,
    tuition_amount: null, fee_basis: 'monthly', class_type: 'group', end_date_jalali: end,
  };
}

function makeEmptyForm(): MemberForm {
  const start = todayJalali();
  const end   = addJalaliMonths(start, 1);
  return {
    full_name: '', phone: '', membership_type: 'monthly', birthday: null, notes: '',
    national_id: '', referrer: '', has_insurance: false, goal: '', member_code: '',
    start_date_jalali: start,
    sports: [makeEmptySport(end)],
  };
}

function calcTotalSessions(weekly: number): number { return Math.min(Math.max(weekly, 0), 6) * 4; }

function todayIso(): string { return new Date().toISOString().split('T')[0]; }
function weekEndIso(): string { return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; }
function isMemberActive(endDate: string): boolean { return endDate >= todayIso(); }
function isMemberExpiring(endDate: string): boolean { return endDate >= todayIso() && endDate <= weekEndIso(); }

function validateForm(form: MemberForm): string | null {
  if (!form.full_name.trim()) return 'نام الزامی است';
  if (!/^09\d{9}$/.test(form.phone.trim())) return 'شماره تلفن باید با ۰۹ شروع شده و ۱۱ رقم باشد';
  if (!form.birthday) return 'تاریخ تولد الزامی است';
  if (!form.national_id.trim()) return 'کد ملی الزامی است';
  if (!isValidNationalId(form.national_id.trim())) return 'کد ملی وارد شده معتبر نیست';
  const activeSports = form.sports.filter((s) => s.key !== '' || s.sport.trim() !== '');
  if (activeSports.length === 0) return 'حداقل یک رشته ورزشی انتخاب کنید';
  for (let i = 0; i < activeSports.length; i++) {
    const s = activeSports[i];
    if (s.key === 'custom' && !s.sport.trim()) return `نام رشته سفارشی (رشته ${i + 1}) الزامی است`;
    if (s.total_sessions < 0) return `کل جلسات رشته ${i + 1} نمی‌تواند منفی باشد`;
    if (s.used_sessions < 0) return `جلسات استفاده‌شده رشته ${i + 1} نمی‌تواند منفی باشد`;
    if (s.used_sessions > s.total_sessions) return `جلسات استفاده‌شده رشته ${i + 1} نمی‌تواند بیشتر از کل جلسات باشد`;
    if (compareJalali(s.end_date_jalali, form.start_date_jalali) < 0) return `تاریخ پایان رشته ${i + 1} باید بعد از تاریخ شروع باشد`;
  }
  return null;
}

function toMemberPayload(form: MemberForm): MemberFormPayload {
  const start = jalaliToGregorianIso(form.start_date_jalali);
  const activeSports = form.sports.filter((s) => s.key !== '' || s.sport.trim() !== '');
  const sports = activeSports.map((s) => ({
    sport: (s.key !== 'custom' && s.key ? SPORT_PLAN_OPTIONS.find((o) => o.key === s.key)?.sport : s.sport.trim()) || s.sport.trim(),
    sport_plan_key: s.key === 'custom' ? 'custom' : s.key,
    weekly_sessions: s.weekly_sessions,
    total_sessions: s.total_sessions,
    used_sessions: s.used_sessions,
    tuition_amount: s.tuition_amount,
    fee_basis: s.fee_basis,
    class_type: s.class_type,
    start_date: start,
    expiry_date: jalaliToGregorianIso(s.end_date_jalali),
  }));
  const endDates = sports.map((s) => s.expiry_date);
  const end = endDates.length ? endDates.reduce((a, b) => (a >= b ? a : b)) : start;
  return {
    full_name: form.full_name.trim(), phone: form.phone.trim(), membership_type: form.membership_type,
    member_code: form.member_code.trim() ? form.member_code.trim() : null,
    birthday: form.birthday ? jalaliToGregorianIso(form.birthday) : '', notes: form.notes.trim(),
    national_id: form.national_id.trim(), referrer: form.referrer.trim(), has_insurance: form.has_insurance,
    goal: form.goal || null,
    start_date: start, end_date: end,
    weekly_sessions: sports.reduce((sum, s) => sum + s.weekly_sessions, 0),
    total_sessions: sports.reduce((sum, s) => sum + s.total_sessions, 0),
    used_sessions: sports.reduce((sum, s) => sum + s.used_sessions, 0),
    sport: sports.map((s) => s.sport).filter(Boolean).join(' + '),
    tuition_amount: sports.reduce((sum, s) => sum + (s.tuition_amount ?? 0), 0),
    fee_basis: sports.some((s) => s.fee_basis === 'session') ? 'session' : 'monthly',
    class_type: sports[0]?.class_type ?? 'group',
    sports,
  };
}

function JalaliDatePicker({ label, value, onChange, min, yearRange }: { label: string; value: JalaliDate; onChange: (date: JalaliDate) => void; min?: JalaliDate; yearRange?: { from: number; to: number }; }) {
  const currentYear = todayJalali().year;
  const from = yearRange?.from ?? currentYear - 5;
  const to   = yearRange?.to   ?? currentYear + 10;
  const years = Array.from({ length: Math.max(1, to - from + 1) }, (_, i) => from + i);
  const maxDay = jalaliDaysInMonth(value.year, value.month);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);
  const update = (patch: Partial<JalaliDate>) => {
    const next = { ...value, ...patch };
    onChange({ ...next, day: Math.min(next.day, jalaliDaysInMonth(next.year, next.month)) });
  };
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <div className="grid grid-cols-3 gap-2">
        <select className="input-dark" value={value.day} onChange={(e) => update({ day: Number(e.target.value) })}>
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="input-dark" value={value.month} onChange={(e) => update({ month: Number(e.target.value) })}>
          {jalaliMonthNames.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
        <select className="input-dark" value={value.year} onChange={(e) => update({ year: Number(e.target.value) })}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {min && compareJalali(value, min) < 0 && <p className="text-xs text-red-400 mt-1">تاریخ نمی‌تواند قبل از تاریخ شروع باشد</p>}
    </div>
  );
}

function BirthdayPicker({ value, onChange }: { value: JalaliDate | null; onChange: (date: JalaliDate | null) => void; }) {
  const currentYear = todayJalali().year;
  const fallback: JalaliDate = { year: 1370, month: 1, day: 1 };
  const effective = value ?? fallback;
  const years = Array.from({ length: currentYear - 1330 + 1 }, (_, i) => 1330 + i);
  const maxDay = jalaliDaysInMonth(effective.year, effective.month);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);
  const update = (patch: Partial<JalaliDate>) => {
    const next = { ...effective, ...patch };
    onChange({ ...next, day: Math.min(next.day, jalaliDaysInMonth(next.year, next.month)) });
  };
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">تاریخ تولد *</label>
      <div className="grid grid-cols-3 gap-2">
        <select className="input-dark" value={effective.day} onChange={(e) => update({ day: Number(e.target.value) })}>
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="input-dark" value={effective.month} onChange={(e) => update({ month: Number(e.target.value) })}>
          {jalaliMonthNames.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
        <select className="input-dark" value={effective.year} onChange={(e) => update({ year: Number(e.target.value) })}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {value === null && <p className="text-xs text-red-400 mt-1">تاریخ تولد را انتخاب کنید</p>}
    </div>
  );
}

function RenewModal({ member, onClose, onDone }: { member: Member; onClose: () => void; onDone: () => void; }) {
  const today = todayJalali();
  const [sportIdx, setSportIdx] = useState(0);
  const [endDate, setEndDate] = useState(addJalaliMonths(today, 1));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const sports = member.sports && member.sports.length > 0 ? member.sports : [];
  const handleRenew = async () => {
    setSubmitting(true); setError('');
    try {
      const updatedSports = sports.map((s, i) => ({
        sport: s.sport,
        sport_plan_key: s.sport_plan_key,
        weekly_sessions: s.weekly_sessions,
        total_sessions: s.total_sessions,
        used_sessions: i === sportIdx ? 0 : s.used_sessions,
        tuition_amount: s.tuition_amount,
        fee_basis: s.fee_basis,
        class_type: s.class_type,
        start_date: s.start_date || jalaliToGregorianIso(today),
        expiry_date: i === sportIdx ? jalaliToGregorianIso(endDate) : s.expiry_date,
      }));
      const payload: MemberFormPayload = {
        full_name: member.full_name, phone: member.phone, membership_type: member.membership_type,
        birthday: member.birthday && /^\d{4}-\d{2}-\d{2}/.test(member.birthday) ? member.birthday : '',
        notes: member.notes ?? '', national_id: member.national_id ?? '', referrer: member.referrer ?? '',
        has_insurance: member.has_insurance ?? false, goal: member.goal ?? null,
        start_date: member.start_date || jalaliToGregorianIso(today),
        end_date: updatedSports.reduce((a, b) => (a >= b.expiry_date ? a : b.expiry_date), ''),
        weekly_sessions: updatedSports.reduce((s, x) => s + x.weekly_sessions, 0),
        total_sessions: updatedSports.reduce((s, x) => s + x.total_sessions, 0),
        used_sessions: updatedSports.reduce((s, x) => s + x.used_sessions, 0),
        sport: updatedSports.map((s) => s.sport).filter(Boolean).join(' + '),
        tuition_amount: updatedSports.reduce((s, x) => s + (x.tuition_amount ?? 0), 0),
        fee_basis: updatedSports.some((s) => s.fee_basis === 'session') ? 'session' : 'monthly',
        class_type: updatedSports[0]?.class_type ?? 'group',
        sports: updatedSports,
      };
      const { error: err } = await updateMember(member.id, payload);
      if (err) throw err;
      onDone();
    } catch (err) { setError(getApiErrorMessage(err)); }
    finally { setSubmitting(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} dir="rtl">
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)' }} onClick={onClose} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '24rem' }}>
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><RefreshCcw size={18} className="text-gold-400" /> تمدید عضویت</h2>
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-sm text-white">{member.full_name}</p>
            <p className="text-xs text-gray-500 mt-1">{member.phone}</p>
          </div>
          {sports.length > 1 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">رشته‌ای که تمدید می‌شود</label>
              <select className="input-dark" value={sportIdx} onChange={(e) => setSportIdx(Number(e.target.value))}>
                {sports.map((s, i) => (
                  <option key={i} value={i}>{s.sport || `رشته ${i + 1}`} (جلسات: {s.used_sessions}/{s.total_sessions})</option>
                ))}
              </select>
            </div>
          )}
          <p className="text-xs text-gray-400">تاریخ شروع: امروز — جلسات استفاده‌شده همین رشته ریست می‌شود</p>
          <JalaliDatePicker label="تاریخ پایان جدید" value={endDate} onChange={setEndDate} />
          <div className="flex gap-2 pt-1">
            {['۱ ماه', '۲ ماه', '۳ ماه'].map((label, i) => (
              <button key={i} type="button" onClick={() => setEndDate(addJalaliMonths(today, i + 1))}
                className="flex-1 text-xs py-2 rounded-lg bg-white/5 text-gray-400 hover:bg-gold-500/10 hover:text-gold-400 transition-all border border-white/10">{label}</button>
            ))}
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleRenew} disabled={submitting} className="btn-gold flex-1">{submitting ? '...' : 'تمدید'}</button>
            <button onClick={onClose} className="px-4 text-gray-400 hover:text-white">بستن</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function downloadServerExport() {
  const a = document.createElement('a');
  a.href = `${API_BASE}/members/export`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function Members() {
  const [searchParams] = useSearchParams();
  const [members, setMembers]         = useState<Member[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterKey, setFilterKey]     = useState<string>(() => {
    const param = searchParams.get('filter');
    if (param === 'active' || param === 'inactive' || param === 'expiring') return param;
    return 'all';
  });
  const [exportMeta, setExportMeta]   = useState<{ updated_at: string } | null>(null);
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState<Member | null>(null);
  const [renewTarget, setRenewTarget] = useState<Member | null>(null);
  const [form, setForm]               = useState<MemberForm>(makeEmptyForm());
  const [formError, setFormError]     = useState('');
  const [submitting, setSubmitting]   = useState(false);

  useEffect(() => { fetchMembers(); }, []);

  useEffect(() => {
    apiGet<{ updated_at: string }>('/members/export/meta').then((r) => {
      if (r.data) setExportMeta(r.data);
    });
  }, []);

  const fetchMembers = async () => {
    setLoading(true);
    const { data, error } = await getMembers();
    if (error) console.error('fetchMembers error:', error);
    // مرتب‌سازی: جدیدترین عضو ثبت‌شده اول
    const sorted = (data || []).sort((a, b) => Number(b.id) - Number(a.id));
    setMembers(sorted);
    setLoading(false);
  };

  // ✅ لیست رشته‌ها از آرایه‌ی sports همه‌ی اعضا
  const sportOptions = useMemo(
    () => Array.from(new Set(members.flatMap((m) => m.sports.map((s) => s.sport)).filter(Boolean))).sort((a, b) => a!.localeCompare(b!, 'fa')) as string[],
    [members],
  );

  const filteredMembers = members.filter((m) => {
    const q = search.toLowerCase();
    const sportsText = (m.sports || []).map((s) => s.sport).join(' ').toLowerCase();
    const matchSearch =
      m.full_name.toLowerCase().includes(q) ||
      m.phone.includes(search) ||
      (m.member_code || '').includes(search) ||
      sportsText.includes(q) ||
      (m.national_id || '').includes(search);
    let matchFilter = true;
    switch (filterKey) {
      case 'all':      matchFilter = true; break;
      case 'active':   matchFilter = isMemberActive(m.end_date); break;
      case 'inactive': matchFilter = !isMemberActive(m.end_date); break;
      case 'expiring': matchFilter = isMemberExpiring(m.end_date); break;
      case 'insured':   matchFilter = !!m.has_insurance; break;
      case 'uninsured': matchFilter = !m.has_insurance; break;
      default:
        if (filterKey.startsWith('sport:')) matchFilter = (m.sports || []).some((s) => s.sport === filterKey.slice(6));
        else if (filterKey.startsWith('class:')) matchFilter = (m.sports || []).some((s) => s.class_type === filterKey.slice(6));
        else matchFilter = true;
    }
    return matchSearch && matchFilter;
  });

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const totalPages  = Math.ceil(filteredMembers.length / PAGE_SIZE);
  const pagedMembers = filteredMembers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, filterKey]);

  const openAdd = () => { setEditing(null); setForm(makeEmptyForm()); setFormError(''); setShowModal(true); };

  const openEdit = (member: Member) => {
    setEditing(member);
    const startDate = member.start_date && member.start_date !== '2020-01-01' ? gregorianToJalali(member.start_date) : todayJalali();
    const sports: SportForm[] = (member.sports && member.sports.length > 0
      ? member.sports.map((s: SportEnrollment) => ({
          key: findPlanKey(s.sport, s.total_sessions),
          sport: s.sport || '',
          weekly_sessions: s.weekly_sessions ?? 0,
          total_sessions: s.total_sessions ?? 0,
          used_sessions: s.used_sessions ?? 0,
          tuition_amount: s.tuition_amount ?? null,
          fee_basis: s.fee_basis ?? 'monthly',
          class_type: s.class_type ?? 'group',
          end_date_jalali: s.expiry_date && s.expiry_date !== '2020-01-01'
            ? gregorianToJalali(s.expiry_date)
            : addJalaliMonths(startDate, 1),
        }))
      : [makeEmptySport(addJalaliMonths(startDate, 1))]);
    setForm({
      full_name: member.full_name, phone: member.phone, membership_type: member.membership_type,
      birthday: member.birthday && /^\d{4}-\d{2}-\d{2}/.test(member.birthday) ? gregorianToJalali(member.birthday) : null,
      notes: member.notes ?? '', national_id: member.national_id ?? '', referrer: member.referrer ?? '',
      has_insurance: member.has_insurance ?? false, goal: member.goal ?? '',
      member_code: member.member_code ? String(member.member_code) : '',
      start_date_jalali: startDate,
      sports,
    });
    setFormError(''); setShowModal(true);
  };

  const updateSport = (index: number, patch: Partial<SportForm>) => {
    setForm((f) => {
      const sports = f.sports.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...f, sports };
    });
  };

  const handleSportPlanChange = (index: number, key: string) => {
    if (!key) {
      updateSport(index, { key: '', sport: '', tuition_amount: null });
      return;
    }
    if (key === 'custom') {
      updateSport(index, { key: 'custom', sport: '', tuition_amount: null, total_sessions: 0 });
      return;
    }
    const opt = SPORT_PLAN_OPTIONS.find((o) => o.key === key);
    if (!opt) return;
    updateSport(index, {
      key, sport: opt.sport, tuition_amount: opt.plan.price,
      fee_basis: 'session', total_sessions: opt.plan.sessions,
    });
  };

  const addSport = () => {
    setForm((f) => {
      const lastEnd = f.sports[f.sports.length - 1]?.end_date_jalali ?? addJalaliMonths(todayJalali(), 1);
      return { ...f, sports: [...f.sports, makeEmptySport(lastEnd)] };
    });
  };

  const removeSport = (index: number) => {
    setForm((f) => ({ ...f, sports: f.sports.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError('');
    const validationError = validateForm(form);
    if (validationError) { setFormError(validationError); return; }

    const duplicatePhone = members.find((m) => m.phone === form.phone && m.id !== editing?.id);
    if (duplicatePhone) {
      setFormError(`این شماره تلفن قبلاً برای «${duplicatePhone.full_name}» ثبت شده است`);
      return;
    }
    const duplicateNat = members.find((m) => m.national_id === form.national_id && m.id !== editing?.id);
    if (duplicateNat) {
      setFormError(`این کد ملی قبلاً برای «${duplicateNat.full_name}» ثبت شده است`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = toMemberPayload(form);
      if (editing) { const { error } = await updateMember(editing.id, payload); if (error) throw error; }
      else          { const { error } = await addMember(payload);                if (error) throw error; }
      setShowModal(false); setEditing(null); await fetchMembers();
    } catch (err: unknown) { setFormError(getApiErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('حذف شود؟')) return;
    const { error } = await deleteMember(id);
    if (error) alert(getApiErrorMessage(error));
    else fetchMembers();
  };

  const activeCount   = members.filter((m) => isMemberActive(m.end_date)).length;
  const inactiveCount = members.length - activeCount;
  const expiringCount = members.filter((m) => isMemberExpiring(m.end_date)).length;

  const toFa = (n: number) => n.toLocaleString('fa-IR');

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-white">اعضا</h1>
          {exportMeta && (
            <p className="text-xs text-gray-500 mt-1">
              آخرین خروجی اکسل سرور: {new Date(exportMeta.updated_at).toLocaleString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={downloadServerExport} className="btn-outline-gold flex items-center gap-2" title="دانلود آخرین خروجی اکسل سرور (هر شب آپدیت می‌شود)">
            <Download size={16} /> خروجی اکسل
          </button>
          <button onClick={openAdd} className="btn-gold flex items-center gap-2">
            <UserPlus size={16} /> عضو جدید
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input className="input-dark flex-1" placeholder="جستجو بر اساس نام، تلفن، کد عضویت، رشته یا کد ملی..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select
          className="input-dark sm:w-64"
          value={filterKey}
          onChange={(e) => setFilterKey(e.target.value)}
          aria-label="فیلتر اعضا"
        >
          <optgroup label="وضعیت">
            <option value="all">همه ({toFa(members.length)})</option>
            <option value="active">فعال ({toFa(activeCount)})</option>
            <option value="inactive">غیرفعال ({toFa(inactiveCount)})</option>
            <option value="expiring">منقضی این هفته ({toFa(expiringCount)})</option>
          </optgroup>
          <optgroup label="بیمه ورزشی">
            <option value="insured">دارای بیمه ({toFa(members.filter((m) => m.has_insurance).length)})</option>
            <option value="uninsured">بدون بیمه ({toFa(members.filter((m) => !m.has_insurance).length)})</option>
          </optgroup>
          <optgroup label="رشته ورزشی">
            {sportOptions.map((s) => (
              <option key={s} value={`sport:${s}`}>{s} ({toFa(members.filter((m) => (m.sports || []).some((x) => x.sport === s)).length)})</option>
            ))}
          </optgroup>
          <optgroup label="نوع کلاس">
            <option value="class:group">گروهی</option>
            <option value="class:private">خصوصی</option>
            <option value="class:personal">شخصی</option>
          </optgroup>
        </select>
      </div>

      <div className="glass-card p-4 overflow-x-auto">
        {loading ? (
          <div className="text-gray-400">در حال بارگذاری...</div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-gray-400 py-8 text-center">عضوی یافت نشد</div>
        ) : (
          <table className="w-full text-right min-w-[950px]">
            <thead>
              <tr className="text-gray-400 text-sm">
                <th className="pb-3">کد</th><th className="pb-3">نام</th><th className="pb-3">تلفن</th><th className="pb-3">رشته‌ها</th>
                <th className="pb-3">هدف</th><th className="pb-3">جلسات</th><th className="pb-3">بیمه</th><th className="pb-3">پایان عضویت</th>
                <th className="pb-3">وضعیت</th><th className="pb-3">آخرین تغییر</th><th className="pb-3">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {pagedMembers.map((m) => {
                const active   = isMemberActive(m.end_date);
                const expiring = isMemberExpiring(m.end_date);
                const sports = m.sports && m.sports.length > 0 ? m.sports : [];
                return (
                  <tr key={m.id} className="border-t border-white/10 text-white">
                    <td className="py-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-white/5 text-gold-400 border border-white/10" dir="ltr">
                        {m.member_code || '—'}
                      </span>
                    </td>
                    <td className="py-3">{m.full_name}</td>
                    <td className="py-3">{m.phone}</td>
                    <td className="py-3">
                      {sports.length === 0 ? '—' : (
                        <div className="flex flex-wrap gap-1">
                          {sports.map((s, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gold-500/10 text-gold-400 border border-gold-500/20">{s.sport || '—'}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {m.goal ? (GOAL_LABELS[m.goal as keyof typeof GOAL_LABELS] || m.goal) : '—'}
                      </span>
                    </td>
                    <td className="py-3">
                      {sports.length === 0 ? '—' : (
                        <div className="text-xs space-y-0.5">
                          {sports.map((s, i) => (
                            <div key={i} className={s.sport ? '' : 'text-gray-500'}>
                              {toFa(s.used_sessions ?? 0)}/{toFa(s.total_sessions ?? 0)} {s.sport ? `· ${s.sport}` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-1 rounded-full border ${
                        m.has_insurance
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-white/5 text-gray-500 border-white/10'
                      }`}>
                        {m.has_insurance ? 'دارد' : 'ندارد'}
                      </span>
                    </td>
                    <td className={`py-3 ${expiring ? 'text-amber-400 font-medium' : ''}`}>{formatJalali(m.end_date)}</td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-1 rounded-full border ${
                        expiring  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        active    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                    'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {expiring ? 'منقضی میشه' : active ? 'فعال' : 'غیرفعال'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="text-xs">
                        {m.updated_by ? (
                          <>
                            <span className="text-gray-400">{m.updated_by}</span>
                            <span className="text-gray-600 text-[10px] block mt-0.5">
                              {m.updated_at
                                ? new Date(m.updated_at).toLocaleString('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                : ''}
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2 items-center">
                        <button type="button" disabled className="text-gray-500 opacity-40 cursor-not-allowed" title="چاپ کارت عضویت (به‌زودی)"><Printer size={15} /></button>
                        <button type="button" disabled className="text-gray-500 opacity-40 cursor-not-allowed" title="چاپ رسید (به‌زودی)"><Receipt size={15} /></button>
                        <button type="button" onClick={() => setRenewTarget(m)} className="text-gray-400 hover:text-emerald-400" title="تمدید"><RefreshCcw size={15} /></button>
                        <button type="button" onClick={() => openEdit(m)} className="text-gray-400 hover:text-gold-400" title="ویرایش"><Edit2 size={15} /></button>
                        <button type="button" onClick={() => handleDelete(m.id)} className="text-gray-400 hover:text-red-400" title="حذف"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-gray-500">نمایش {((page - 1) * PAGE_SIZE) + 1} تا {Math.min(page * PAGE_SIZE, filteredMembers.length)} از {filteredMembers.length} عضو</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-xs text-gray-400 hover:text-gold-400 disabled:opacity-30">«</button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs rounded-lg text-gray-400 hover:text-gold-400 hover:bg-gold-500/10 disabled:opacity-30 transition-all">قبلی</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                return <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 text-xs rounded-lg transition-all ${p === page ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30' : 'text-gray-400 hover:text-gold-400 hover:bg-gold-500/10'}`}>{p}</button>;
              })}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 text-xs rounded-lg text-gray-400 hover:text-gold-400 hover:bg-gold-500/10 disabled:opacity-30 transition-all">بعدی</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 text-xs text-gray-400 hover:text-gold-400 disabled:opacity-30">»</button>
            </div>
          </div>
        )}
      </div>

      {renewTarget && <RenewModal member={renewTarget} onClose={() => setRenewTarget(null)} onDone={() => { setRenewTarget(null); fetchMembers(); }} />}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} dir="rtl">
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowModal(false)} />
          <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '30rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <form onSubmit={handleSubmit} className="glass-card p-6 space-y-3">
              <h2 className="text-lg font-bold text-white mb-2">{editing ? 'ویرایش عضو' : 'عضو جدید'}</h2>
              {formError && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{formError}</div>}
              <input className="input-dark" placeholder="نام و نام خانوادگی *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              <input className="input-dark" placeholder="تلفن (۱۱ رقمی) *" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 11) })} required />
              <BirthdayPicker value={form.birthday} onChange={(birthday) => setForm({ ...form, birthday })} />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">کد عضویت (برای دستگاه اسکنر انگشت)</label>
                <input className="input-dark" placeholder="خالی = خودکار" dir="ltr" value={form.member_code}
                  onChange={(e) => setForm({ ...form, member_code: toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 15) })} />
                {editing && editing.member_code && (
                  <p className="text-xs text-gray-500 mt-1">کد فعلی: {editing.member_code}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">کد ملی (۱۰ رقم) *</label>
                  <input className="input-dark" placeholder="کد ملی" dir="ltr" value={form.national_id} onChange={(e) => setForm({ ...form, national_id: toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 10) })} required />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">نوع عضویت</label>
                  <select className="input-dark" value={form.membership_type} onChange={(e) => setForm({ ...form, membership_type: e.target.value as MembershipType })}>
                    {(Object.keys(membershipLabels) as MembershipType[]).map((t) => <option key={t} value={t}>{membershipLabels[t]}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gold-400 font-medium">رشته‌های ورزشی *</label>
                  <button type="button" onClick={addSport} className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1">
                    <Plus size={14} /> افزودن رشته
                  </button>
                </div>
                <div className="space-y-3">
                  {form.sports.map((s, i) => (
                    <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">رشته {i + 1}</span>
                        {form.sports.length > 1 && (
                          <button type="button" onClick={() => removeSport(i)} className="text-gray-500 hover:text-red-400" title="حذف این رشته">
                            <X size={15} />
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">رشته و پلن</label>
                        <select className="input-dark" value={s.key} onChange={(e) => handleSportPlanChange(i, e.target.value)}>
                          <option value="">انتخاب رشته...</option>
                          {SPORT_PLAN_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                          <option value="custom">سایر (سفارشی)</option>
                        </select>
                      </div>
                      {s.key === 'custom' && (
                        <input className="input-dark" placeholder="نام رشته (دستی)" value={s.sport} onChange={(e) => updateSport(i, { sport: e.target.value })} />
                      )}
                      {s.tuition_amount != null && s.key !== 'custom' && (
                        <p className="text-xs text-gold-400">شهریه: {formatToman(s.tuition_amount)}</p>
                      )}
                      <div className="grid grid-cols-3 gap-3">
                        {(s.key === '' || s.key === 'custom') && (
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">جلسات هفتگی (۰-۶)</label>
                            <input type="number" min={0} max={6} className="input-dark" value={s.weekly_sessions}
                              onChange={(e) => {
                                const w = Math.min(Math.max(Number(e.target.value) || 0, 0), 6);
                                updateSport(i, { weekly_sessions: w, total_sessions: s.key === 'custom' ? s.total_sessions : calcTotalSessions(w) });
                              }} />
                          </div>
                        )}
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">
                            {s.key && s.key !== 'custom' ? 'کل جلسات (پلن)' : 'کل جلسات'}
                          </label>
                          <input
                            type="number" min={0}
                            className={`input-dark ${s.key && s.key !== 'custom' ? 'opacity-60 cursor-not-allowed' : ''}`}
                            value={s.total_sessions}
                            readOnly={!!s.key && s.key !== 'custom'}
                            onChange={(e) => updateSport(i, { total_sessions: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">جلسات استفاده‌شده</label>
                          <input type="number" min={0} max={s.total_sessions} className="input-dark" value={s.used_sessions} onChange={(e) => updateSport(i, { used_sessions: Math.max(0, Number(e.target.value) || 0) })} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">نوع کلاس</label>
                        <select className="input-dark" value={s.class_type} onChange={(e) => updateSport(i, { class_type: e.target.value as ClassType })}>
                          <option value="group">گروهی</option>
                          <option value="private">خصوصی</option>
                          <option value="personal">شخصی</option>
                        </select>
                      </div>
                      <JalaliDatePicker label="تاریخ پایان این رشته" value={s.end_date_jalali} min={form.start_date_jalali} onChange={(end_date_jalali) => updateSport(i, { end_date_jalali })} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">بیمه ورزشی</label>
                <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${form.has_insurance ? 'bg-emerald-500/15 border-emerald-500/40' : 'bg-white/5 border-white/10'}`}>
                  <input type="checkbox" checked={form.has_insurance} onChange={(e) => setForm({ ...form, has_insurance: e.target.checked })}
                    className="w-5 h-5 accent-emerald-500 shrink-0" />
                  <span className={`text-sm ${form.has_insurance ? 'text-emerald-400' : 'text-gray-400'}`}>{form.has_insurance ? 'دارد' : 'ندارد'}</span>
                </label>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">نام معرف / منبع آشنایی</label>
                <input className="input-dark" placeholder="معرف (دوست یا اینستاگرام)" value={form.referrer} onChange={(e) => setForm({ ...form, referrer: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">هدف تمرینی (برای پیام شخصی‌سازی‌شده)</label>
                <select className="input-dark" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
                  <option value="">بدون هدف</option>
                  {GOAL_KEYS.map((k) => <option key={k} value={k}>{GOAL_LABELS[k]}</option>)}
                </select>
              </div>
              <JalaliDatePicker label="تاریخ شروع عضویت" value={form.start_date_jalali} onChange={(start_date_jalali) => setForm({ ...form, start_date_jalali })} />
              <textarea className="input-dark min-h-[80px]" placeholder="یادداشت" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-gold flex-1" disabled={submitting}>{submitting ? '...' : editing ? 'ذخیره' : 'ثبت'}</button>
                <button type="button" className="px-4 text-gray-400 hover:text-white" onClick={() => setShowModal(false)}>بستن</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
