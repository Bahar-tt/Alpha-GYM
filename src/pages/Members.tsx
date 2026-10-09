import { useEffect, useState } from 'react';
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
  compareJalali,
  formatJalali,
  jalaliToGregorianIso,
  gregorianToJalali,
  todayJalali,
  type JalaliDate,
} from '../lib/jalaliDate';
import { getMembershipStatus } from '../lib/membershipStatus';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { Pencil, Trash2, UserPlus, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';

interface MemberForm {
  full_name: string;
  phone: string;
  membership_type: MembershipType;
  weekly_sessions: number;
  total_sessions: number;
  used_sessions: number;
  start_date_jalali: JalaliDate;
  end_date_jalali: JalaliDate;
  birthday_jalali: JalaliDate | null;
  notes: string;
}

type Member = MemberRecord;

const membershipLabels: Record<MembershipType, string> = {
  monthly: 'ماهانه',
  quarterly: 'سه‌ماهه',
  yearly: 'سالانه',
  vip: 'VIP',
};

function parseBirthdayToJalali(raw: string): JalaliDate | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (s.includes('/') || (s.includes('-') && s.startsWith('13'))) {
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

const defaultStart = todayJalali();
const defaultEnd = addJalaliMonths(defaultStart, 1);

const emptyForm: MemberForm = {
  full_name: '',
  phone: '',
  membership_type: 'monthly',
  weekly_sessions: 3,
  total_sessions: 12,
  used_sessions: 0,
  start_date_jalali: defaultStart,
  end_date_jalali: defaultEnd,
  birthday_jalali: null,
  notes: '',
};

function validateForm(form: MemberForm): string | null {
  if (!form.full_name.trim()) return 'نام الزامی است';
  if (!form.phone.trim()) return 'شماره تلفن الزامی است';
  if (form.weekly_sessions < 0) return 'جلسات هفتگی نمی‌تواند منفی باشد';
  if (form.total_sessions < 0) return 'تعداد جلسات نمی‌تواند منفی باشد';
  if (form.used_sessions < 0) return 'جلسات استفاده‌شده نمی‌تواند منفی باشد';
  if (form.used_sessions > form.total_sessions) {
    return 'جلسات استفاده‌شده نمی‌تواند بیشتر از کل جلسات باشد';
  }
  if (compareJalali(form.end_date_jalali, form.start_date_jalali) < 0) {
    return 'تاریخ پایان باید بعد از تاریخ شروع باشد';
  }
  return null;
}

function toMemberPayload(form: MemberForm): MemberFormPayload {
  return {
    full_name: form.full_name.trim(),
    phone: form.phone.trim(),
    membership_type: form.membership_type,
    weekly_sessions: form.weekly_sessions,
    total_sessions: form.total_sessions,
    used_sessions: form.used_sessions,
    start_date: jalaliToGregorianIso(form.start_date_jalali),
    end_date: jalaliToGregorianIso(form.end_date_jalali),
    birthday: birthdayToStorage(form.birthday_jalali),
    notes: form.notes.trim(),
  };
}

function StatusBadge({ endDate }: { endDate: string }) {
  const st = getMembershipStatus(endDate);
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
  return <span className="badge badge-warning">{st.label}</span>;
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
    const start = todayJalali();
    setEditing(null);
    setForm({
      ...emptyForm,
      start_date_jalali: start,
      end_date_jalali: addJalaliMonths(start, 1),
      birthday_jalali: null,
    });
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (member: Member) => {
    setEditing(member);
    setForm({
      full_name: member.full_name,
      phone: member.phone,
      membership_type: member.membership_type,
      weekly_sessions: member.weekly_sessions ?? 3,
      total_sessions: member.total_sessions ?? 12,
      used_sessions: member.used_sessions ?? 0,
      start_date_jalali: gregorianToJalali(member.start_date),
      end_date_jalali: gregorianToJalali(member.end_date),
      birthday_jalali: parseBirthdayToJalali(member.birthday ?? ''),
      notes: member.notes ?? '',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const payload = toMemberPayload(form);
      if (editing) {
        const { error } = await updateMember(editing.id, payload);
        if (error) throw error;
      } else {
        const { error } = await addMember(payload);
        if (error) throw error;
      }
      setShowModal(false);
      setForm(emptyForm);
      setEditing(null);
      await fetchMembers();
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err));
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

  const onMembershipTypeChange = (type: MembershipType) => {
    const months = type === 'monthly' ? 1 : type === 'quarterly' ? 3 : type === 'yearly' ? 12 : 1;
    setForm((f) => ({
      ...f,
      membership_type: type,
      end_date_jalali: addJalaliMonths(f.start_date_jalali, months),
    }));
  };

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
                  {['نام', 'تلفن', 'نوع عضویت', 'جلسات', 'پایان عضویت', 'وضعیت', ''].map((h) => (
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
                  const st = getMembershipStatus(m.end_date);
                  const rowClass =
                    st.kind === 'expired'
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
                          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                            {m.full_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {m.phone}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="badge badge-info">{membershipLabels[m.membership_type]}</span>
                      </td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {(m.used_sessions ?? 0).toLocaleString('fa-IR')} /{' '}
                        {(m.total_sessions ?? 0).toLocaleString('fa-IR')}
                      </td>
                      <td
                        className="px-4 py-3.5 text-sm font-medium"
                        style={{
                          color:
                            st.kind === 'active' ? 'var(--text-secondary)' : 'var(--danger)',
                        }}
                      >
                        {formatJalali(m.end_date)}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge endDate={m.end_date} />
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
            className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
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
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  اطلاعات را کامل کنید و ذخیره را بزنید
                </p>
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
              {formError && (
                <div
                  className="p-3 rounded-xl text-sm"
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                >
                  {formError}
                </div>
              )}

              <section>
                <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>
                  اطلاعات فردی
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      نام و نام خانوادگی <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      className="input-field"
                      placeholder="مثال: علی رضایی"
                      value={form.full_name}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      شماره موبایل <span style={{ color: 'var(--danger)' }}>*</span>
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
                    allowClear
                    placeholder="اختیاری — انتخاب از تقویم"
                  />
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      نوع عضویت
                    </label>
                    <select
                      className="input-field"
                      value={form.membership_type}
                      onChange={(e) => onMembershipTypeChange(e.target.value as MembershipType)}
                    >
                      {Object.entries(membershipLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>
                  بازه عضویت (شمسی)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <JalaliDatePicker
                    label="تاریخ شروع"
                    value={form.start_date_jalali}
                    required
                    onChange={(start_date_jalali) => {
                      if (!start_date_jalali) return;
                      setForm((f) => {
                        const months =
                          f.membership_type === 'monthly'
                            ? 1
                            : f.membership_type === 'quarterly'
                              ? 3
                              : f.membership_type === 'yearly'
                                ? 12
                                : 1;
                        return {
                          ...f,
                          start_date_jalali,
                          end_date_jalali: addJalaliMonths(start_date_jalali, months),
                        };
                      });
                    }}
                  />
                  <JalaliDatePicker
                    label="تاریخ پایان"
                    value={form.end_date_jalali}
                    required
                    min={form.start_date_jalali}
                    onChange={(end_date_jalali) => {
                      if (!end_date_jalali) return;
                      setForm({ ...form, end_date_jalali });
                    }}
                  />
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>
                  جلسات
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      هفتگی
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
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      کل جلسات
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="input-field"
                      value={form.total_sessions}
                      onChange={(e) =>
                        setForm({ ...form, total_sessions: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      استفاده‌شده
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={form.total_sessions}
                      className="input-field"
                      value={form.used_sessions}
                      onChange={(e) =>
                        setForm({ ...form, used_sessions: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
              </section>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  یادداشت
                </label>
                <textarea
                  className="input-field min-h-[72px]"
                  placeholder="توضیحات اختیاری..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
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
    </div>
  );
}
