import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Clock3, LogIn, LogOut, RefreshCcw, Save, Users } from 'lucide-react';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { gregorianToJalali, jalaliToGregorianIso, todayJalali, type JalaliDate } from '../lib/jalaliDate';
import { apiGet, apiPost } from '../services/api';

type Person = { id: number; full_name: string; personnel_type?: string; fingerprint_id?: string | null };
type Attendance = { id: number; personnel_id: number; full_name: string; work_date: string; check_in?: string | null; check_out?: string | null; status: string; source?: string };
type Overview = { today: string; today_time: string; personnel: Person[]; attendance: Attendance[]; leaves: unknown[] };

const typeLabels: Record<string, string> = { coach: 'مربی', staff: 'کارمند', manager: 'مدیر', other: 'سایر' };
const statusLabels: Record<string, string> = { present: 'حاضر', absent: 'غایب', leave: 'مرخصی' };

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function PersonnelAttendance() {
  const today = todayJalali();
  const [from, setFrom] = useState<JalaliDate>(today);
  const [to, setTo] = useState<JalaliDate>(today);
  const [data, setData] = useState<Overview | null>(null);
  const [selected, setSelected] = useState('');
  const [manualDate, setManualDate] = useState<JalaliDate>(today);
  const [checkIn, setCheckIn] = useState('09:00');
  const [checkOut, setCheckOut] = useState('17:00');
  const [status, setStatus] = useState('present');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setBusy(true);
    const result = await apiGet<Overview>(`/personnel-attendance/overview?from=${jalaliToGregorianIso(from)}&to=${jalaliToGregorianIso(to)}`);
    if (result.data) setData(result.data);
    if (result.error) setMessage(result.error);
    setBusy(false);
  };

  useEffect(() => { void load(); }, [from.year, from.month, from.day, to.year, to.month, to.day]);

  const todayRows = useMemo(() => (data?.attendance || []).filter((r) => r.work_date === data?.today), [data]);
  const selectedRow = todayRows.find((r) => String(r.personnel_id) === selected);

  const check = async (action: 'check-in' | 'check-out') => {
    if (!selected) return setMessage('ابتدا نام پرسنل را انتخاب کنید');
    setBusy(true); setMessage('');
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const result = await apiPost('/personnel-attendance/manual', {
      personnel_id: Number(selected), work_date: todayIso(),
      check_in: action === 'check-in' ? (selectedRow?.check_in || time) : (selectedRow?.check_in || time),
      check_out: action === 'check-out' ? time : (selectedRow?.check_out || null), status: 'present',
    });
    if (result.error) setMessage(result.error); else setMessage(action === 'check-in' ? 'ورود ثبت شد' : 'خروج ثبت شد');
    await load();
    setBusy(false);
  };

  const saveManual = async () => {
    if (!selected) return setMessage('ابتدا نام پرسنل را انتخاب کنید');
    setBusy(true); setMessage('');
    const result = await apiPost('/personnel-attendance/manual', {
      personnel_id: Number(selected), work_date: jalaliToGregorianIso(manualDate), check_in: checkIn || null,
      check_out: checkOut || null, status, note: note || null,
    });
    if (result.error) setMessage(result.error); else setMessage('تردد با موفقیت ذخیره شد');
    await load();
    setBusy(false);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>تردد پرسنل</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>ثبت ورود و خروج، تردد دستی و مشاهده سوابق پرسنل</p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary flex items-center gap-2" disabled={busy}><RefreshCcw size={16} />به‌روزرسانی</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card"><Users size={18} style={{ color: 'var(--accent)' }} /><p className="text-2xl font-bold mt-3" style={{ color: 'var(--text)' }}>{data?.personnel.length ?? 0}</p><p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>پرسنل فعال</p></div>
        <div className="stat-card"><CalendarCheck size={18} style={{ color: 'var(--success)' }} /><p className="text-2xl font-bold mt-3" style={{ color: 'var(--text)' }}>{todayRows.filter((r) => r.status === 'present').length}</p><p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>حاضر امروز</p></div>
        <div className="stat-card"><Clock3 size={18} style={{ color: 'var(--gold)' }} /><p className="text-2xl font-bold mt-3" style={{ color: 'var(--text)' }}>{data?.today_time || '—'}</p><p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>ساعت فعلی</p></div>
      </div>

      <div className="panel-card p-4 overflow-visible relative z-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <JalaliDatePicker label="از تاریخ" value={from} onChange={(v) => v && setFrom(v)} />
          <JalaliDatePicker label="تا تاریخ" value={to} onChange={(v) => v && setTo(v)} />
        </div>
      </div>

      <div className="panel-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="field-label min-w-[220px]">پرسنل<select className="input-field mt-1" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">انتخاب پرسنل</option>{(data?.personnel || []).map((p) => <option key={p.id} value={p.id}>{p.full_name} — {typeLabels[p.personnel_type || 'other'] || 'سایر'}</option>)}</select></label>
          <button type="button" className="btn-primary flex items-center gap-2" onClick={() => void check('check-in')} disabled={busy}><LogIn size={16} />ثبت ورود</button>
          <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => void check('check-out')} disabled={busy}><LogOut size={16} />ثبت خروج</button>
          {selectedRow && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>امروز: {selectedRow.check_in || '—'} تا {selectedRow.check_out || '—'}</span>}
        </div>
      </div>

      <div className="panel-card p-4">
        <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>ثبت یا اصلاح تردد دستی</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <JalaliDatePicker label="تاریخ تردد" value={manualDate} onChange={(v) => v && setManualDate(v)} />
          <label className="field-label">ورود<input className="input-field mt-1" type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></label>
          <label className="field-label">خروج<input className="input-field mt-1" type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></label>
          <label className="field-label">وضعیت<select className="input-field mt-1" value={status} onChange={(e) => setStatus(e.target.value)}><option value="present">حاضر</option><option value="absent">غایب</option><option value="leave">مرخصی</option></select></label>
          <button type="button" className="btn-primary flex items-center justify-center gap-2 h-10" onClick={() => void saveManual()} disabled={busy}><Save size={16} />ذخیره</button>
        </div>
        <input className="input-field mt-3" placeholder="یادداشت اختیاری" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {message && <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--accent-soft)', color: 'var(--text)' }}>{message}</div>}

      <div className="panel-card overflow-hidden">
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}><h3 className="font-bold" style={{ color: 'var(--text)' }}>سوابق تردد</h3></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px]"><thead><tr style={{ background: 'var(--bg-muted)' }}>{['تاریخ', 'نام پرسنل', 'نوع', 'ورود', 'خروج', 'وضعیت', 'منبع'].map((h) => <th key={h} className="text-right text-xs px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead><tbody>{(data?.attendance || []).map((r) => <tr key={r.id} className="table-row"><td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{gregorianToJalali(r.work_date).year}/{String(gregorianToJalali(r.work_date).month).padStart(2, '0')}/{String(gregorianToJalali(r.work_date).day).padStart(2, '0')}</td><td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text)' }}>{r.full_name}</td><td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{typeLabels[(data?.personnel.find((p) => p.id === r.personnel_id)?.personnel_type) || 'other'] || 'سایر'}</td><td className="px-4 py-3 text-sm" style={{ color: 'var(--success)' }}>{r.check_in || '—'}</td><td className="px-4 py-3 text-sm" style={{ color: 'var(--accent)' }}>{r.check_out || '—'}</td><td className="px-4 py-3 text-xs"><span className="badge badge-success">{statusLabels[r.status] || r.status}</span></td><td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{r.source === 'fingerprint' ? 'دستگاه' : 'دستی'}</td></tr>)}</tbody></table></div>
        {!data?.attendance.length && <p className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>برای بازه انتخاب‌شده رکوردی وجود ندارد.</p>}
      </div>
    </div>
  );
}
