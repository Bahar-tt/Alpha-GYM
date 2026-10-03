import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, User, Activity, Target, HeartPulse, Camera, Ruler,
  Save, CheckCircle2, X, AlertTriangle, Plus, Trash2, FileText,
} from 'lucide-react';
import {
  FTM_GOALS, FTM_INJURIES, FTM_LEVELS, FTM_PLACES,
  assessmentToForm, archiveAssessment, completionPercent, emptyFtmForm, finalizeAssessment,
  getMemberAssessments, injuryLabel, levelLabel, placeLabel, saveAssessment,
  statusLabels,
  type FtmAssessment, type FtmFormValues, type FtmGoal, type FtmInjury, type FtmLevel, type FtmPlace,
} from '../services/ftmService';
import { getMembers, type MemberRecord } from '../services/memberService';
import { getApiErrorMessage } from '../lib/errors';
import { todayJalali, jalaliToGregorianIso, gregorianToJalali, type JalaliDate } from '../lib/jalaliDate';

/**
 * FtmPanel — فرم ارزیابی اولیه ورزشکار (FTM-7)
 *
 * فرم استاندارد بدنسازی: مشخصات فردی، سابقه، سطح، هدف، سوابق پزشکی،
 * عکس از ۳ زاویه، و اندازه‌های بدن.
 */
export default function FtmPanel() {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [history, setHistory] = useState<FtmAssessment[]>([]);
  const [form, setForm] = useState<FtmFormValues | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [openHistory, setOpenHistory] = useState(false);

  // ── بارگذاری اعضا ──
  useEffect(() => {
    getMembers().then(({ data }) => setMembers(data || []));
  }, []);

  // ── وقتی عضو انتخاب شد ──
  useEffect(() => {
    if (memberId == null) { setForm(null); setHistory([]); return; }
    setLoading(true); setError(''); setMsg('');
    getMemberAssessments(memberId).then((r) => {
      if (r.error) { setError(r.error); setLoading(false); return; }
      const list = (r.data?.assessments || []).filter((a) => a.status !== 'archived');
      setHistory(list);
      // آخرین فرم فعال را باز کن، وگرنه فرم خالی
      if (list.length > 0) setForm(assessmentToForm(list[0]));
      else setForm(emptyFtmForm(memberId));
      setLoading(false);
    });
  }, [memberId]);

  const set = useCallback(<K extends keyof FtmFormValues>(key: K, value: FtmFormValues[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }, []);

  const toggleInList = <K extends 'goals' | 'injuries'>(
    key: K, value: FtmFormValues[K][number],
  ) => {
    setForm((f) => {
      if (!f) return f;
      const list = f[key] as string[];
      const next = list.includes(value as string)
        ? list.filter((x) => x !== value)
        : [...list, value as string];
      return { ...f, [key]: next } as FtmFormValues;
    });
  };

  const save = async (status: 'draft' | 'final') => {
    if (!form) return;
    setSaving(true); setError(''); setMsg('');
    const payload = { ...form, status };
    const r = await saveAssessment(payload);
    if (r.error) setError(getApiErrorMessage(r.error));
    else {
      setMsg(status === 'final' ? 'فرم نهایی و ذخیره شد' : 'پیش‌نویس ذخیره شد');
      if (status === 'final' && r.data) setForm(assessmentToForm(r.data));
      const h = await getMemberAssessments(form.member_id);
      setHistory((h.data?.assessments || []).filter((a) => a.status !== 'archived'));
    }
    setSaving(false);
  };

  const finalize = async (id: number) => {
    const r = await finalizeAssessment(id);
    if (r.error) setError(getApiErrorMessage(r.error));
    else { setMsg('فرم نهایی شد'); const h = await getMemberAssessments(memberId!); setHistory((h.data?.assessments || []).filter((a) => a.status !== 'archived')); }
  };

  const archive = async (id: number) => {
    await archiveAssessment(id);
    const h = await getMemberAssessments(memberId!);
    const remaining = (h.data?.assessments || []).filter((a) => a.status !== 'archived');
    setHistory(remaining);
    setForm(remaining.length ? assessmentToForm(remaining[0]) : emptyFtmForm(memberId!));
    setMsg('فرم بایگانی شد');
  };

  const completion = useMemo(() => (form ? completionPercent(form) : 0), [form]);

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── انتخاب عضو ── */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ClipboardList size={20} className="text-gold-400" />
              فرم ارزیابی اولیه ورزشکار
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              فرم استاندارد FTM-7 برای ارزیابی بدنسازی پیش از شروع برنامه
            </p>
          </div>
          {history.length > 0 && (
            <button onClick={() => setOpenHistory(!openHistory)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border border-gold-500/20 text-gray-400 hover:text-gold-400">
              <FileText size={14} />
              سوابق ({history.length})
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="text-xs text-gray-400 block mb-1">ورزشکار *</label>
            <select className="input-dark" value={memberId ?? ''} onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— انتخاب ورزشکار —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} {m.member_code ? `(${m.member_code})` : ''}
                </option>
              ))}
            </select>
          </div>
          {form && (
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-gray-400 block mb-1">تکمیل فرم</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${completion >= 80 ? 'bg-emerald-500' : completion >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${completion}%` }} />
                </div>
                <span className={`text-xs ${completion >= 80 ? 'text-emerald-400' : completion >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {completion}٪
                </span>
              </div>
            </div>
          )}
        </div>

        {/* تاریخچه */}
        {openHistory && history.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-gold-500/10">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-xs">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded ${h.status === 'final' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                    {statusLabels[h.status]}
                  </span>
                  <span className="text-gray-400">{h.created_at?.slice(0, 10)}</span>
                  {h.coach_name && <span className="text-gray-500">مربی: {h.coach_name}</span>}
                </div>
                <div className="flex items-center gap-1">
                  {h.status === 'draft' && (
                    <button onClick={() => finalize(h.id)} title="نهایی‌سازی"
                      className="p-1.5 rounded text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10">
                      <CheckCircle2 size={14} />
                    </button>
                  )}
                  <button onClick={() => archive(h.id)} title="بایگانی"
                    className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {msg && <p className="text-xs text-emerald-400">{msg}</p>}
        {error && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </div>
        )}
      </div>

      {loading && <div className="h-40 bg-white/5 rounded-xl animate-pulse" />}

      {!loading && !form && (
        <div className="py-12 text-center">
          <ClipboardList size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">برای شروع، ورزشکار را انتخاب کنید</p>
        </div>
      )}

      {!loading && form && (
        <div className="space-y-5">
          {/* ═══ مشخصات فردی ═══ */}
          <Section icon={User} title="مشخصات فردی">
            <Grid3>
              <NumField label="سن (سال)" value={form.age} onChange={(v) => set('age', v)} placeholder="۲۵" />
              <NumField label="قد (سانتی‌متر)" value={form.height_cm} onChange={(v) => set('height_cm', v)} placeholder="۱۷۸" />
              <NumField label="وزن (کیلوگرم)" value={form.weight_kg} step="0.1" onChange={(v) => set('weight_kg', v)} placeholder="۷۵.۵" />
            </Grid3>
          </Section>

          {/* ═══ سابقه ورزشی ═══ */}
          <Section icon={Activity} title="سابقه ورزشی">
            <Grid3>
              <NumField label="چند سال سابقه بدنسازی" value={form.bodybuilding_years} step="0.5"
                onChange={(v) => set('bodybuilding_years', v)} placeholder="۲" />
              <JalaliField label="آخرین برنامه بدنسازی" value={form.last_program_date}
                onChange={(iso) => set('last_program_date', iso)} placeholder="انتخاب تاریخ" />
              <NumField label="چند روز در هفته می‌توانید" value={form.days_per_week} max={7}
                onChange={(v) => set('days_per_week', v)} placeholder="۴" />
            </Grid3>
          </Section>

          {/* ═══ سطح ورزشکار ═══ */}
          <Section icon={Target} title="سطح ورزشکار">
            <div className="grid grid-cols-3 gap-2">
              {FTM_LEVELS.map((l) => (
                <CheckTile key={l.key} label={l.label} checked={form.level === l.key}
                  onChange={() => set('level', l.key)} radio />
              ))}
            </div>
            <div className="mt-4">
              <label className="text-xs text-gray-400 block mb-2">محل تمرین</label>
              <div className="grid grid-cols-3 gap-2">
                {FTM_PLACES.map((p) => (
                  <CheckTile key={p.key} label={p.label} checked={form.training_place === p.key}
                    onChange={() => set('training_place', p.key)} radio />
                ))}
              </div>
            </div>
            {form.training_place === 'home' && (
              <div className="mt-3">
                <label className="text-xs text-gray-400 block mb-1">تجهیزات موجود در منزل؟</label>
                <textarea className="input-dark min-h-[60px]" value={form.home_equipment ?? ''}
                  onChange={(e) => set('home_equipment', e.target.value)}
                  placeholder="دمبل، هالتر، کش، بارفیکس..." />
              </div>
            )}
          </Section>

          {/* ═══ هدف ═══ */}
          <Section icon={Target} title="هدف از برنامه" hint="می‌توانید چند گزینه را انتخاب کنید">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {FTM_GOALS.map((g) => (
                <CheckTile key={g.key} label={g.label}
                  checked={(form.goals as string[]).includes(g.key)}
                  onChange={() => toggleInList('goals', g.key as FtmGoal)} />
              ))}
            </div>
          </Section>

          {/* ═══ سوابق پزشکی ═══ */}
          <Section icon={HeartPulse} title="سوابق پزشکی">
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-2">آیا سابقه آسیب‌دیدگی دارید؟</label>
                <div className="flex flex-wrap gap-2">
                  {FTM_INJURIES.map((i) => (
                    <CheckTile key={i.key} label={i.label}
                      checked={(form.injuries as string[]).includes(i.key)}
                      onChange={() => toggleInList('injuries', i.key as FtmInjury)} />
                  ))}
                </div>
              </div>

              {(form.injuries as string[]).includes('other') && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">سایر — توضیح</label>
                  <input className="input-dark" value={form.injury_other ?? ''}
                    onChange={(e) => set('injury_other', e.target.value)} placeholder="مثلاً آسیب رباط صلیبی" />
                </div>
              )}

              <TextArea label="آیا در حال حاضر درد یا محدودیت حرکتی دارید؟"
                value={form.current_pain} onChange={(v) => set('current_pain', v)}
                placeholder="درد، محدودیت دامنه حرکتی، یا «خیر»" />

              <TextArea label="آیا پزشک شما را از انجام حرکت خاصی منع کرده است؟"
                value={form.doctor_restrictions} onChange={(v) => set('doctor_restrictions', v)}
                placeholder="حرکات ممنوعه، یا «خیر»" />
            </div>
          </Section>

          {/* ═══ عکس از ۳ زاویه ═══ */}
          <Section icon={Camera} title="عکس از ۳ زاویه" hint="عکس‌ها بدون صورت باشد">
            <div className="grid grid-cols-3 gap-3">
              <PhotoTile label="پشت" value={form.photo_back} onChange={(v) => set('photo_back', v)} />
              <PhotoTile label="روبه‌رو" value={form.photo_front} onChange={(v) => set('photo_front', v)} />
              <PhotoTile label="نیمرک" value={form.photo_side} onChange={(v) => set('photo_side', v)} />
            </div>
          </Section>

          {/* ═══ اندازه‌ها ═══ */}
          <Section icon={Ruler} title="اندازه‌های بدن" hint="همه به سانتی‌متر، به‌جز وزن">
            <div className="mb-3">
              <JalaliField label="تاریخ اندازه‌گیری" value={form.measured_at}
                onChange={(iso) => set('measured_at', iso)} placeholder="امروز" />
            </div>
            <Grid3>
              <NumField label="وزن (کیلوگرم)" value={form.m_weight} step="0.1"
                onChange={(v) => set('m_weight', v)} placeholder="۷۵.۵" />
              <NumField label="دور سینه" value={form.m_chest} step="0.5" onChange={(v) => set('m_chest', v)} placeholder="۱۰۵" />
              <NumField label="دور بازو" value={form.m_arm} step="0.5" onChange={(v) => set('m_arm', v)} placeholder="۳۸" />
            </Grid3>
            <Grid3 className="mt-3">
              <NumField label="دور کمر (باریک‌ترین)" value={form.m_waist} step="0.5"
                onChange={(v) => set('m_waist', v)} placeholder="۸۲" />
              <NumField label="دور شکم (برجسته‌ترین)" value={form.m_abdomen} step="0.5"
                onChange={(v) => set('m_abdomen', v)} placeholder="۹۰" />
              <NumField label="دور باسن (برجسته‌ترین)" value={form.m_glutes} step="0.5"
                onChange={(v) => set('m_glutes', v)} placeholder="۱۰۰" />
            </Grid3>
            <div className="mt-3 max-w-xs">
              <NumField label="دور ران (قسمت بالایی پا)" value={form.m_thigh} step="0.5"
                onChange={(v) => set('m_thigh', v)} placeholder="۵۸" />
            </div>
          </Section>

          {/* ═══ یادداشت ═══ */}
          <Section icon={FileText} title="یادداشت مربی">
            <TextArea label="یادداشت" value={form.notes} onChange={(v) => set('notes', v)}
              placeholder="مشاهدات، نکات مهم، محدودیت‌های خاص..." rows={4} />
          </Section>

          {/* ═══ اقدام ═══ */}
          <div className="glass-card p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className={`px-2 py-1 rounded ${form.status === 'final' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                {statusLabels[form.status]}
              </span>
              <span>تکمیل: {completion}٪</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => save('draft')} disabled={saving}
                className="px-4 py-2.5 rounded-lg text-sm bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 disabled:opacity-40 flex items-center gap-2">
                <Save size={15} /> ذخیره پیش‌نویس
              </button>
              <button onClick={() => save('final')} disabled={saving || completion < 60}
                title={completion < 60 ? 'برای نهایی‌سازی حداقل ۶۰٪ فرم باید پر شود' : ''}
                className="px-4 py-2.5 rounded-lg text-sm bg-gold-500/15 text-gold-400 border border-gold-500/30 hover:bg-gold-500/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                <CheckCircle2 size={15} /> نهایی‌سازی
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ اجزای کوچک ═══════════ */

function Section({ icon: Icon, title, hint, children }: {
  icon: typeof User; title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-gold-500/10">
        <Icon size={18} className="text-gold-400" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {hint && <span className="text-[10px] text-gray-500 mr-auto">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Grid3({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${className}`}>{children}</div>;
}

function NumField({ label, value, onChange, placeholder, step = 1, max }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  placeholder?: string; step?: number; max?: number;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <input
        type="number" step={step} max={max}
        className="input-dark" dir="ltr"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 2 }: {
  label: string; value: string | null; onChange: (v: string | null) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <textarea
        className="input-dark" style={{ minHeight: `${rows * 44}px` }}
        value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}

function JalaliField({ label, value, onChange, placeholder }: {
  label: string; value: string | null; onChange: (iso: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const jalali: JalaliDate | null = value && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? gregorianToJalali(value.slice(0, 10))
    : null;

  return (
    <div className="relative">
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <button type="button" onClick={() => setOpen(!open)}
        className="input-dark text-right flex items-center justify-between">
        <span>{jalali || placeholder || 'انتخاب تاریخ'}</span>
        <span className="text-gray-500 text-xs">📅</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 right-0">
          <SimpleJalaliPicker value={jalali || todayJalali()} onPick={(j) => { onChange(jalaliToGregorianIso(j)); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

/** تقویم جلالی سبک — بدون وابستگی خارجی */
function SimpleJalaliPicker({ value, onPick }: { value: JalaliDate; onPick: (d: JalaliDate) => void }) {
  const [sel, setSel] = useState<JalaliDate>(value);
  const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const [y, m] = sel.split('/');
  const year = Number(y);
  const month = Number(m);

  const daysInMonth = useMemo(() => {
    if (month <= 6) return 31;
    if (month <= 11) return 30;
    const leap = (year % 4 === 3 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 30 : 29;
  }, [month, year]);

  return (
    <div className="glass-card p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => {
          const ny = month === 12 ? year + 1 : year;
          const nm = month === 12 ? 1 : month + 1;
          setSel(`${String(ny).padStart(4, '0')}/${String(nm).padStart(2, '0')}/01`);
        }} className="p-1 text-gray-400 hover:text-gold-400">‹</button>
        <select value={month} onChange={(e) => setSel(`${String(year).padStart(4, '0')}/${String(e.target.value).padStart(2, '0')}/01`)}
          className="input-dark py-1 text-xs">
          {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <button onClick={() => {
          const ny = month === 1 ? year - 1 : year;
          const nm = month === 1 ? 12 : month - 1;
          setSel(`${String(ny).padStart(4, '0')}/${String(nm).padStart(2, '0')}/01`);
        }} className="p-1 text-gray-400 hover:text-gold-400">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
        {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((d) => <div key={d} className="text-gray-600 py-1">{d}</div>)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = String(i + 1).padStart(2, '0');
          const iso = `${String(year).padStart(4, '0')}/${String(month).padStart(2, '0')}/${day}`;
          const active = value === iso;
          return (
            <button key={day} onClick={() => onPick(iso as JalaliDate)}
              className={`py-1 rounded transition-colors ${active ? 'bg-gold-500/30 text-gold-400' : 'text-gray-300 hover:bg-white/10'}`}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CheckTile({ label, checked, onChange, radio }: {
  label: string; checked: boolean; onChange: () => void; radio?: boolean;
}) {
  return (
    <button type="button" onClick={onChange}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all text-right ${
        checked
          ? 'bg-gold-500/15 border-gold-500/40 text-gold-400'
          : 'bg-white/5 border-white/10 text-gray-400 hover:border-gold-500/25'
      }`}>
      <span className={`w-4 h-4 border flex items-center justify-center shrink-0 ${radio ? 'rounded-full' : 'rounded'}`}
        style={{ borderColor: checked ? '#d4a843' : '#4b5563', background: checked ? '#d4a843' : 'transparent' }}>
        {checked && <span className="w-1.5 h-1.5 rounded-full bg-black" />}
      </span>
      {label}
    </button>
  );
}

/** آپلود عکس: به data URL تبدیل و ذخیره می‌شود */
function PhotoTile({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const inputId = `ftm-photo-${label}-${Math.random().toString(36).slice(2, 8)}`;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      // فشرده‌سازی: عرض حداکثر ۸۰۰ پیکسل
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 800 / img.width);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        onChange(canvas.toDataURL('image/jpeg', 0.75));
        setBusy(false);
      };
      img.onerror = () => { onChange(String(reader.result)); setBusy(false); };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <label htmlFor={inputId}
        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gold-500/20 hover:border-gold-500/40 transition-colors cursor-pointer overflow-hidden"
        style={{ minHeight: '130px' }}>
        {value ? (
          <img src={value} alt={label} className="w-full object-contain" style={{ maxHeight: '130px' }} />
        ) : (
          <>
            <Plus size={20} className="text-gray-600" />
            <span className="text-[10px] text-gray-600 mt-1">{busy ? '...' : 'افزودن عکس'}</span>
          </>
        )}
        <input id={inputId} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </label>
      {value && (
        <button onClick={() => onChange(null)} className="mt-1 text-[10px] text-red-400 hover:underline">
          حذف
        </button>
      )}
    </div>
  );
}
