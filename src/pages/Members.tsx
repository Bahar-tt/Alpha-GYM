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
  jalaliDaysInMonth,
  jalaliMonthNames,
  jalaliToGregorianIso,
  gregorianToJalali,
  todayJalali,
  type JalaliDate,
} from '../lib/jalaliDate';
import {
  Pencil,
  Trash2,
  UserPlus,
  Search,
  X,
} from 'lucide-react';

interface MemberForm {
  full_name: string;
  phone: string;
  membership_type: MembershipType;
  weekly_sessions: number;
  total_sessions: number;
  used_sessions: number;
  start_date_jalali: JalaliDate;
  end_date_jalali: JalaliDate;
  birthday: string;
  notes: string;
}

type Member = MemberRecord;

const membershipLabels: Record<MembershipType, string> = {
  monthly: 'ماهانه',
  quarterly: 'سه‌ماهه',
  yearly: 'سالانه',
  vip: 'VIP',
};

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
  birthday: '',
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
    birthday: form.birthday,
    notes: form.notes.trim(),
  };
}

function JalaliDatePicker({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: JalaliDate;
  onChange: (date: JalaliDate) => void;
  min?: JalaliDate;
}) {
  const years = Array.from({ length: 21 }, (_, i) => todayJalali().year - 5 + i);
  const maxDay = jalaliDaysInMonth(value.year, value.month);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  const update = (patch: Partial<JalaliDate>) => {
    const next = { ...value, ...patch };
    const cappedDay = Math.min(next.day, jalaliDaysInMonth(next.year, next.month));
    onChange({ ...next, day: cappedDay });
  };

  const isBeforeMin = min && compareJalali(value, min) < 0;

  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <div className="grid grid-cols-3 gap-2">
        <select className="input-field" value={value.day} onChange={(e) => update({ day: Number(e.target.value) })}>
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select className="input-field" value={value.month} onChange={(e) => update({ month: Number(e.target.value) })}>
          {jalaliMonthNames.map((name, i) => (
            <option key={name} value={i + 1}>{name}</option>
          ))}
        </select>
        <select className="input-field" value={value.year} onChange={(e) => update({ year: Number(e.target.value) })}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      {isBeforeMin && (
        <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
          تاریخ نمی‌تواند قبل از تاریخ شروع باشد
        </p>
      )}
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
    setForm(emptyForm);
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
      birthday: member.birthday ?? '',
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
      console.error('Member submit error:', err);
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">اعضا</h1>
          <p className="page-subtitle">{members.length.toLocaleString('fa-IR')} عضو ثبت‌شده</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
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
            <table className="w-full text-right min-w-[700px]">
              <thead>
                <tr style={{ background: 'var(--bg-muted)' }}>
                  {['نام', 'تلفن', 'نوع عضویت', 'جلسات', 'پایان عضویت', 'وضعیت', ''].map((h) => (
                    <th
                      key={h}
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
                  const active = m.is_active ?? (m.end_date >= new Date().toISOString().split('T')[0]);
                  return (
                    <tr key={m.id} className="table-row">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
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
                        <span className="badge badge-info">
                          {membershipLabels[m.membership_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {(m.used_sessions ?? 0).toLocaleString('fa-IR')} / {(m.total_sessions ?? 0).toLocaleString('fa-IR')}
                      </td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {formatJalali(m.end_date)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`badge ${active ? 'badge-success' : 'badge-danger'}`}>
                          {active ? 'فعال' : 'غیرفعال'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => openEdit(m)}
                            className="p-2 rounded-lg transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.color = 'var(--accent)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(m.id)}
                            className="p-2 rounded-lg transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }}
        >
          <form
            onSubmit={handleSubmit}
            className="panel-card w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                {editing ? 'ویرایش عضو' : 'عضو جدید'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div
                className="p-3 rounded-xl text-sm"
                style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
              >
                {formError}
              </div>
            )}

            <input
              className="input-field"
              placeholder="نام و نام خانوادگی *"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />

            <input
              className="input-field"
              placeholder="تلفن *"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />

            <input
              className="input-field"
              placeholder="تاریخ تولد (اختیاری - YYYY-MM-DD)"
              value={form.birthday}
              onChange={(e) => setForm({ ...form, birthday: e.target.value })}
            />

            <select
              className="input-field"
              value={form.membership_type}
              onChange={(e) =>
                setForm({ ...form, membership_type: e.target.value as MembershipType })
              }
            >
              {Object.entries(membershipLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
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
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
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
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
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
                  required
                />
              </div>
            </div>

            <JalaliDatePicker
              label="تاریخ شروع"
              value={form.start_date_jalali}
              onChange={(start_date_jalali) => setForm({ ...form, start_date_jalali })}
            />

            <JalaliDatePicker
              label="تاریخ پایان"
              value={form.end_date_jalali}
              min={form.start_date_jalali}
              onChange={(end_date_jalali) => setForm({ ...form, end_date_jalali })}
            />

            <textarea
              className="input-field min-h-[80px]"
              placeholder="یادداشت"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <div className="flex gap-2 pt-2">
              <button type="submit" className="btn-primary flex-1" disabled={submitting}>
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
