import { useEffect, useMemo, useState } from 'react';
import {
  addMember,
  deleteMember,
  getMembers,
  updateMember,
  recordAttendance,
  type MemberFormPayload,
  type MemberRecord,
  type MembershipType,
} from '../services/memberService';
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
import {
  Pencil,
  Trash2,
  UserPlus,
  Search,
  X,
  Bell,
  Cake,
  Info,
  Eye,
  Fingerprint,
  User,
  RefreshCcw,
  CalendarCheck,
  Dumbbell,
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
  membership_type: MembershipType;
  birthday_jalali: JalaliDate | null;
  personnel_code: string;
  coach_name: string;
  weekly_sessions: number;
}

interface RenewalLog {
  member_id: string;
  status: string;
  created_at?: string;
  months?: number;
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
  membership_type: 'monthly',
  birthday_jalali: null,
  personnel_code: '',
  coach_name: '',
  weekly_sessions: 3,
});

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
  }, []);

  const fetchMembers = async () => {
    setLoading(true);
    const { data, error } = await getMembers();
    if (error) console.error('fetchMembers error:', error);
    setMembers(data || []);
    setLoading(false);
  };

  const filteredMembers = members.filter((m) => {
    const q = search.toLowerCase();
    return (
      m.full_name.toLowerCase().includes(q) ||
      m.phone.includes(search) ||
      (m.personnel_code || '').toLowerCase().includes(q)
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
      membership_type: member.membership_type || 'monthly',
      birthday_jalali: parseBirthdayToJalali(member.birthday ?? ''),
      personnel_code: member.personnel_code || '',
      coach_name: member.coach_name || '',
      weekly_sessions: member.weekly_sessions ?? 3,
    });
    setFormError('');
    setShowModal(true);
  };

  const validate = (): string | null => {
    if (!form.first_name.trim()) return 'نام الزامی است';
    if (!form.last_name.trim()) return 'نام خانوادگی الزامی است';
    if (!form.phone.trim()) return 'شماره تماس الزامی است';
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
      coach_name: form.coach_name.trim(),
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
    const { error } = await recordAttendance({
      personnel_code: m.personnel_code,
      member_id: m.id,
      source: 'manual',
    });
    if (error) alert(error);
    else {
      await fetchMembers();
      if (profileMember?.id === m.id) {
        const updated = (await getMembers()).data?.find((x) => x.id === m.id);
        if (updated) setProfileMember(updated);
      }
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

  const modalStatus = editing
    ? getMembershipStatus(editing.end_date, archivedIds.has(editing.id))
    : { kind: 'active' as const, label: 'پس از ثبت: فعال', needsRenewal: false, daysLeft: 30 };

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
        <Search
          size={16}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          className="input-field pr-10"
          placeholder="جستجو نام، تلفن یا کد پرسنلی..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="panel-card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 skeleton" />
            ))}
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>عضوی یافت نشد</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right min-w-[900px]">
              <thead>
                <tr style={{ background: 'var(--bg-muted)' }}>
                  {[
                    'نام',
                    'تلفن',
                    'کد پرسنلی',
                    'نوع عضویت',
                    'جلسات',
                    'پایان عضویت',
                    'وضعیت',
                    '',
                  ].map((h) => (
                    <th
                      key={h || 'actions'}
                      className="px-4 py-3 text-xs font-semibold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {h}
                    </th>
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
                        <button
                          type="button"
                          onClick={() => setProfileMember(m)}
                          className="flex items-center gap-3 text-right hover:opacity-80"
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                            style={{
                              background:
                                st.kind === 'active' ? 'var(--accent-soft)' : 'var(--danger-soft)',
                              color: st.kind === 'active' ? 'var(--accent)' : 'var(--danger)',
                            }}
                          >
                            {m.full_name?.charAt(0) || '?'}
                          </div>
                          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                            {m.full_name}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {m.phone}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-1 rounded-lg"
                          style={{ background: 'var(--bg-muted)', color: 'var(--text)' }}
                          dir="ltr"
                        >
                          <Fingerprint size={12} style={{ color: 'var(--accent)' }} />
                          {m.personnel_code || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="badge badge-info">
                          {membershipLabels[m.membership_type] || m.membership_type}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {(m.weekly_sessions ?? 0).toLocaleString('fa-IR')} / هفته
                      </td>
                      <td
                        className="px-4 py-3.5 text-sm font-medium"
                        style={{
                          color: st.kind === 'active' ? 'var(--text-secondary)' : 'var(--danger)',
                        }}
                      >
                        {formatJalali(m.end_date)}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge endDate={m.end_date} archived={archived} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1 justify-end">
                          <button
                            type="button"
                            title="مشاهده پروفایل"
                            onClick={() => setProfileMember(m)}
                            className="p-2 rounded-lg"
                            style={{ color: 'var(--accent)' }}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            title="ویرایش"
                            onClick={() => openEdit(m)}
                            className="p-2 rounded-lg"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            title="حذف"
                            onClick={() => handleDelete(m.id)}
                            className="p-2 rounded-lg"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Trash2 size={15} />
                          </button>
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

      {/* مودال ثبت / ویرایش */}
      {showModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow)',
              maxHeight: '92vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="shrink-0 px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                {editing ? 'ویرایش عضو' : 'ثبت عضو جدید'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <section
                className="rounded-2xl p-4 space-y-3"
                style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <Info size={16} style={{ color: 'var(--accent)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    وضعیت
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`badge ${
                      modalStatus.kind === 'active'
                        ? 'badge-success'
                        : modalStatus.kind === 'archived'
                          ? 'badge-warning'
                          : 'badge-danger'
                    }`}
                  >
                    {modalStatus.label}
                  </span>
                </div>
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div className="flex items-start gap-2">
                    <Bell size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
                    <span>۳ روز قبل از پایان عضویت، پیامک یادآوری خودکار ارسال می‌شود.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Cake size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <span>در روز تولد، پیامک تبریک خودکار ارسال می‌شود.</span>
                  </div>
                </div>
              </section>

              {formError && (
                <div
                  className="p-3 rounded-xl text-sm"
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    نام <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    className="input-field"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    نام خانوادگی <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    className="input-field"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  شماره تماس <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  className="input-field"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  کد پرسنلی / اثر انگشت <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div className="relative">
                  <Fingerprint
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--accent)' }}
                  />
                  <input
                    className="input-field pr-10"
                    placeholder="همان کد دستگاه اثر انگشت"
                    value={form.personnel_code}
                    onChange={(e) => setForm({ ...form, personnel_code: e.target.value })}
                    required
                    dir="ltr"
                  />
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  این کد باید با شناسه کاربر روی دستگاه اثر انگشت یکسان باشد تا حضور ثبت شود.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  نام مربی
                </label>
                <div className="relative">
                  <Dumbbell
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    className="input-field pr-10"
                    placeholder="نام کامل مربی"
                    value={form.coach_name}
                    onChange={(e) => setForm({ ...form, coach_name: e.target.value })}
                  />
                </div>
              </div>

              <JalaliDatePicker
                label="تاریخ تولد"
                value={form.birthday_jalali}
                onChange={(birthday_jalali) => setForm({ ...form, birthday_jalali })}
                required
                placeholder="انتخاب از تقویم شمسی"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    نوع عضویت
                  </label>
                  <select
                    className="input-field"
                    value={form.membership_type}
                    onChange={(e) =>
                      setForm({ ...form, membership_type: e.target.value as MembershipType })
                    }
                  >
                    {Object.entries(membershipLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    جلسات هفتگی
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="input-field"
                    value={form.weekly_sessions}
                    onChange={(e) =>
                      setForm({ ...form, weekly_sessions: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    تاریخ شروع
                  </label>
                  <div className="input-field" style={{ opacity: 0.85 }}>
                    {previewStart}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    تاریخ پایان
                  </label>
                  <div className="input-field font-semibold" style={{ color: 'var(--accent)', opacity: 0.9 }}>
                    {previewEnd}
                  </div>
                </div>
              </div>
            </div>

            <div
              className="shrink-0 px-6 py-4 flex flex-row-reverse gap-3"
              style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}
            >
              <button type="submit" className="btn-primary min-w-[140px]" disabled={submitting}>
                {submitting ? 'در حال ذخیره...' : editing ? 'ذخیره تغییرات' : 'ثبت عضو'}
              </button>
              <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>
                انصراف
              </button>
            </div>
          </form>
        </div>
      )}

      {/* مشاهده پروفایل */}
      {profileMember && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfileMember(null);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow)',
              maxHeight: '92vh',
            }}
          >
            <div
              className="px-6 py-5 flex items-start justify-between gap-3"
              style={{
                background: 'linear-gradient(135deg, #0c8ce7 0%, #006fc5 100%)',
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-white text-xl font-bold">
                  {profileMember.full_name?.charAt(0) || '?'}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{profileMember.full_name}</h2>
                  <p className="text-white/70 text-sm" dir="ltr">
                    {profileMember.phone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileMember(null)}
                className="p-2 rounded-xl bg-white/15 text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92vh - 100px)' }}>
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  endDate={profileMember.end_date}
                  archived={archivedIds.has(profileMember.id)}
                />
                {profileMember.personnel_code && (
                  <span
                    className="badge badge-info inline-flex items-center gap-1"
                    dir="ltr"
                  >
                    <Fingerprint size={12} />
                    {profileMember.personnel_code}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="panel-card p-3">
                  <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--text-muted)' }}>
                    <RefreshCcw size={14} />
                    <span className="text-[11px]">تعداد تمدیدها</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
                    {profileRenewalCount.toLocaleString('fa-IR')}
                  </p>
                </div>
                <div className="panel-card p-3">
                  <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--text-muted)' }}>
                    <CalendarCheck size={14} />
                    <span className="text-[11px]">تعداد حضورها</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
                    {(profileMember.attendance_count ?? 0).toLocaleString('fa-IR')}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <ProfileRow
                  icon={<User size={14} />}
                  label="نام کامل"
                  value={profileMember.full_name}
                />
                <ProfileRow icon={<span />} label="تلفن" value={profileMember.phone} ltr />
                <ProfileRow
                  icon={<Fingerprint size={14} />}
                  label="کد پرسنلی"
                  value={profileMember.personnel_code || '—'}
                  ltr
                />
                <ProfileRow
                  icon={<Dumbbell size={14} />}
                  label="مربی"
                  value={profileMember.coach_name || 'تعیین نشده'}
                />
                <ProfileRow
                  icon={<span />}
                  label="نوع عضویت"
                  value={membershipLabels[profileMember.membership_type] || profileMember.membership_type}
                />
                <ProfileRow
                  icon={<span />}
                  label="جلسات هفتگی"
                  value={(profileMember.weekly_sessions ?? 0).toLocaleString('fa-IR')}
                />
                <ProfileRow
                  icon={<span />}
                  label="شروع عضویت"
                  value={formatJalali(profileMember.start_date || profileMember.end_date)}
                />
                <ProfileRow
                  icon={<span />}
                  label="پایان عضویت"
                  value={formatJalali(profileMember.end_date)}
                />
                <ProfileRow
                  icon={<Cake size={14} />}
                  label="تاریخ تولد"
                  value={profileMember.birthday || '—'}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  onClick={() => handleCheckIn(profileMember)}
                >
                  <CalendarCheck size={16} />
                  ثبت حضور
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => {
                    setProfileMember(null);
                    openEdit(profileMember);
                  }}
                >
                  <Pencil size={16} />
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

function ProfileRow({
  icon,
  label,
  value,
  ltr,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl"
      style={{ background: 'var(--bg-muted)' }}
    >
      <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        {icon}
        {label}
      </span>
      <span
        className="text-sm font-medium text-left"
        style={{ color: 'var(--text)' }}
        dir={ltr ? 'ltr' : undefined}
      >
        {value}
      </span>
    </div>
  );
}
