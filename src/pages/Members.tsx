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
import { CreditCard as Edit2, Trash2, UserPlus } from 'lucide-react';

interface MemberForm {
  full_name: string;
  phone: string;
  membership_type: MembershipType;
  weekly_sessions: number;
  total_sessions: number;
  used_sessions: number;
  start_date_jalali: JalaliDate;
  end_date_jalali: JalaliDate;
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
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <div className="grid grid-cols-3 gap-2">
        <select
          className="input-dark"
          value={value.day}
          onChange={(e) => update({ day: Number(e.target.value) })}
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="input-dark"
          value={value.month}
          onChange={(e) => update({ month: Number(e.target.value) })}
        >
          {jalaliMonthNames.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="input-dark"
          value={value.year}
          onChange={(e) => update({ year: Number(e.target.value) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {isBeforeMin && (
        <p className="text-xs text-red-400 mt-1">تاریخ نمی‌تواند قبل از تاریخ شروع باشد</p>
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
    if (!confirm('حذف شود؟')) return;
    const { error } = await deleteMember(id);
    if (error) alert(getApiErrorMessage(error));
    else fetchMembers();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-white">اعضا</h1>
        <button onClick={openAdd} className="btn-gold flex items-center gap-2">
          <UserPlus size={16} />
          عضو جدید
        </button>
      </div>

      <input
        className="input-dark w-full"
        placeholder="جستجو بر اساس نام یا تلفن..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="glass-card p-4 overflow-x-auto">
        {loading ? (
          <div className="text-gray-400">در حال بارگذاری...</div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-gray-400">عضوی یافت نشد</div>
        ) : (
          <table className="w-full text-right min-w-[640px]">
            <thead>
              <tr className="text-gray-400 text-sm">
                <th className="pb-3">نام</th>
                <th className="pb-3">تلفن</th>
                <th className="pb-3">نوع عضویت</th>
                <th className="pb-3">جلسات</th>
                <th className="pb-3">پایان عضویت (شمسی)</th>
                <th className="pb-3">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((m) => (
                <tr key={m.id} className="border-t border-white/10 text-white">
                  <td className="py-3">{m.full_name}</td>
                  <td className="py-3">{m.phone}</td>
                  <td className="py-3">{membershipLabels[m.membership_type]}</td>
                  <td className="py-3">
                    {m.used_sessions ?? 0} / {m.total_sessions ?? 0}
                  </td>
                  <td className="py-3">{formatJalali(m.end_date)}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(m)}
                        className="text-gray-400 hover:text-gold-400"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id)}
                        className="text-gray-400 hover:text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleSubmit}
            className="glass-card p-6 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-lg font-bold text-white mb-2">
              {editing ? 'ویرایش عضو' : 'عضو جدید'}
            </h2>

            {formError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {formError}
              </div>
            )}

            <input
              className="input-dark"
              placeholder="نام و نام خانوادگی *"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />

            <input
              className="input-dark"
              placeholder="تلفن *"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />

            <select
              className="input-dark"
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

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">جلسات هفتگی</label>
                <input
                  type="number"
                  min={0}
                  className="input-dark"
                  value={form.weekly_sessions}
                  onChange={(e) =>
                    setForm({ ...form, weekly_sessions: Number(e.target.value) || 0 })
                  }
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">کل جلسات</label>
                <input
                  type="number"
                  min={0}
                  className="input-dark"
                  value={form.total_sessions}
                  onChange={(e) =>
                    setForm({ ...form, total_sessions: Number(e.target.value) || 0 })
                  }
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">جلسات استفاده‌شده</label>
                <input
                  type="number"
                  min={0}
                  max={form.total_sessions}
                  className="input-dark"
                  value={form.used_sessions}
                  onChange={(e) =>
                    setForm({ ...form, used_sessions: Number(e.target.value) || 0 })
                  }
                  required
                />
              </div>
            </div>

            <JalaliDatePicker
              label="تاریخ شروع (شمسی)"
              value={form.start_date_jalali}
              onChange={(start_date_jalali) => setForm({ ...form, start_date_jalali })}
            />

            <JalaliDatePicker
              label="تاریخ پایان (شمسی)"
              value={form.end_date_jalali}
              min={form.start_date_jalali}
              onChange={(end_date_jalali) => setForm({ ...form, end_date_jalali })}
            />

            <textarea
              className="input-dark min-h-[80px]"
              placeholder="یادداشت"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <div className="flex gap-2 pt-2">
              <button type="submit" className="btn-gold flex-1" disabled={submitting}>
                {submitting ? '...' : editing ? 'ذخیره' : 'ثبت'}
              </button>
              <button
                type="button"
                className="px-4 text-gray-400 hover:text-white"
                onClick={() => setShowModal(false)}
              >
                بستن
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
