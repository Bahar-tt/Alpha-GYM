import { useEffect, useMemo, useState } from 'react';
import {
  addMember,
  deleteMember,
  getMembers,
  updateMember,
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
import { Pencil, Trash2, UserPlus, Search, X, Bell, Cake, Info } from 'lucide-react';
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
});

function StatusBadge({ endDate, archived }: { endDate: string; archived?: boolean }) {
  const st = getMembershipStatus(endDate, archived);
  if (st.kind === 'active') {
    return <span className="badge badge-success">{st.label}</span>;
  }
  if (st.kind === 'expiring_soon') {
    return <span className="badge badge-danger">{st.label}</span>;
  }
  if (st.kind === 'expired') {
    return (
      <Link to="/renewals" className="badge badge-danger hover:opacity-90">
        {st.label}
      </Link>
    );
  }
  if (st.kind === 'archived') {
    return <span className="badge badge-warning">{st.label}</span>;
  }
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

  const archivedIds = useMemo(() => new Set(loadJson<string[]>(ARCHIVED_KEY, [])), [members, showModal]);

  const renewedIds = useMemo(() => {
    const logs = loadJson<{ member_id: string; status: string }[]>(RENEWALS_KEY, []);
    return new Set(logs.filter((l) => l.status === 'completed').map((l) => l.member_id));
  }, [members, showModal]);

  // تاریخ شروع = امروز ثبت — پایان بر اساس نوع عضویت
  const startJalali = todayJalali();
  const endJalali = useMemo(
    () => addJalaliMonths(startJalali, monthsForMembershipType(form.membership_type)),
    [form.membership_type, startJalali.year, startJalali.month, startJalali.day],
  );

  // برای ویرایش: شروع و پایان از رکورد
  const editStart = editing ? gregorianToJalali(editing.start_date || editing.end_date) : startJalali;
  const editEnd = editing
    ? gregorianToJalali(editing.end_date)
    : endJalali;

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
    return m.full_name.toLowerCase().includes(q) || m.phone.includes(search);
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
    });
    setFormError('');
    setShowModal(true);
  };

  const validate = (): string | null => {
    if (!form.first_name.trim()) return 'نام الزامی است';
    if (!form.last_name.trim()) return 'نام خانوادگی الزامی است';
    if (!form.phone.trim()) return 'شماره تماس الزامی است';
    if (!form.birthday_jalali) return 'تاریخ تولد الزامی است — از تقویم انتخاب کنید';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }

    const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`;
    const start = editing ? editStart : todayJalali();
    const end = editing
      ? addJalaliMonths(editStart, monthsForMembershipType(form.membership_type))
      : addJalaliMonths(todayJalali(), monthsForMembershipType(form.membership_type));

    // اگر در حال ویرایش فقط نوع عضویت عوض شده، از امروز تمدید نکن — از همان start فعلی
    const endDate = editing
      ? addJalaliMonths(
          gregorianToJalali(editing.start_date || editing.end_date),
          monthsForMembershipType(form.membership_type),
        )
      : end;

    const payload: MemberFormPayload = {
      full_name: fullName,
      phone: form.phone.trim(),
      membership_type: form.membership_type,
      weekly_sessions: 3,
      total_sessions: 12,
      used_sessions: 0,
      start_date: jalaliToGregorianIso(editing ? gregorianToJalali(editing.start_date || editing.end_date) : todayJalali()),
      end_date: jalaliToGregorianIso(
        editing
          ? addJalaliMonths(
              gregorianToJalali(editing.start_date || editing.end_date),
              monthsForMembershipType(form.membership_type),
            )
          : addJalaliMonths(todayJalali(), monthsForMembershipType(form.membership_type)),
      ),
      birthday: birthdayToStorage(form.birthday_jalali),
      notes: '',
    };

    // برای ویرایش بدون تغییر نوع عضویت، تاریخ پایان قبلی را حفظ کن اگر نوع عوض نشده
    if (editing && form.membership_type === editing.membership_type) {
      payload.end_date = editing.end_date;
      payload.start_date = editing.start_date || editing.end_date;
    }

    setSubmitting(true);
    try {
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
          placeholder="جستجو بر اساس نام یا تلفن..."
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
            <table className="w-full text-right min-w-[780px]">
              <thead>
                <tr style={{ background: 'var(--bg-muted)' }}>
                  {['نام', 'تلفن', 'نوع عضویت', 'پایان عضویت', 'وضعیت', ''].map((h) => (
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
                        <div className="flex items-center gap-3">
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
                          <div>
                            <span className="text-sm font-medium block" style={{ color: 'var(--text)' }}>
                              {m.full_name}
                            </span>
                            {renewedIds.has(m.id) && st.kind === 'active' && (
                              <span className="text-[10px]" style={{ color: 'var(--success)' }}>
                                تمدید شده
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {m.phone}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="badge badge-info">
                          {membershipLabels[m.membership_type] || m.membership_type}
                        </span>
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
                            onClick={() => openEdit(m)}
                            className="p-2 rounded-lg"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
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
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                  {editing ? 'ویرایش عضو' : 'ثبت عضو جدید'}
                </h2>
              </div>
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
              {/* وضعیت */}
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
                  {editing && renewedIds.has(editing.id) && (
                    <span className="badge badge-info">تمدید شده</span>
                  )}
                  {editing && archivedIds.has(editing.id) && (
                    <span className="badge badge-warning">رد شده</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
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

              <section className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      نام <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      className="input-field"
                      placeholder="مثال: علی"
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
                      placeholder="مثال: رضایی"
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
                    placeholder="09xxxxxxxxx"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                    dir="ltr"
                  />
                </div>

                <JalaliDatePicker
                  label="تاریخ تولد"
                  value={form.birthday_jalali}
                  onChange={(birthday_jalali) => setForm({ ...form, birthday_jalali })}
                  required
                  placeholder="انتخاب از تقویم شمسی"
                />

                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    نوع عضویت <span style={{ color: 'var(--danger)' }}>*</span>
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

                {/* تاریخ‌ها — فقط نمایش، غیرقابل ویرایش دستی */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      تاریخ شروع
                    </label>
                    <div
                      className="input-field flex items-center"
                      style={{ opacity: 0.85, cursor: 'default' }}
                    >
                      {previewStart}
                      <span className="mr-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {editing ? 'از ثبت قبلی' : 'روز ثبت‌نام'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      تاریخ پایان
                    </label>
                    <div
                      className="input-field flex items-center font-semibold"
                      style={{ opacity: 0.85, cursor: 'default', color: 'var(--accent)' }}
                    >
                      {previewEnd}
                      <span className="mr-auto text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>
                        خودکار از نوع عضویت
                      </span>
                    </div>
                  </div>
                </div>
              </section>
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
    </div>
  );
}
