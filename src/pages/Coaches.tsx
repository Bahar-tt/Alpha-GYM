import { useEffect, useState } from 'react';
import {
  getCoaches,
  getCoach,
  addCoach,
  updateCoach,
  deleteCoach,
  type Coach,
  type CoachForm,
  type CoachDetail,
} from '../services/coachService';
import { getApiErrorMessage } from '../lib/errors';
import ProfileExtrasFields, { emptyExtras } from '../components/ProfileExtrasFields';
import PrintCardButton from '../components/PrintCardButton';
import {
  UserPlus,
  Pencil,
  Trash2,
  X,
  Eye,
  Percent,
  Wallet,
  Users,
} from 'lucide-react';

const emptyForm = (): CoachForm => ({
  full_name: '',
  phone: '',
  specialty: '',
  commission_percent: 30,
  notes: '',
  is_active: true,
  has_insurance: false,
  insurance_notes: '',
  referrer_name: '',
  referral_source: '',
  training_goal: '',
  photo_url: '',
});

export default function Coaches() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Coach | null>(null);
  const [form, setForm] = useState<CoachForm>(emptyForm());
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<CoachDetail | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await getCoaches();
    if (error) console.error(error);
    setCoaches(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (c: Coach) => {
    setEditing(c);
    setForm({
      full_name: c.full_name,
      phone: c.phone || '',
      specialty: c.specialty || '',
      commission_percent: Number(c.commission_percent) || 0,
      notes: c.notes || '',
      is_active: c.is_active !== 0,
      has_insurance: !!(c.has_insurance === 1 || c.has_insurance === true),
      insurance_notes: c.insurance_notes || '',
      referrer_name: c.referrer_name || '',
      referral_source: c.referral_source || '',
      training_goal: c.training_goal || '',
      photo_url: c.photo_url || '',
    });
    setFormError('');
    setShowModal(true);
  };

  const openProfile = async (c: Coach) => {
    const { data } = await getCoach(c.id);
    setProfile(data || { ...c, stats: { member_count: 0, total_monthly_fee: 0, total_commission: 0 } });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setFormError('نام مربی الزامی است');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      if (editing) {
        const { error } = await updateCoach(editing.id, form);
        if (error) throw error;
      } else {
        const { error } = await addCoach(form);
        if (error) throw error;
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('حذف این مربی؟ اعضای مرتبط بدون مربی می‌مانند.')) return;
    const { error } = await deleteCoach(id);
    if (error) alert(error.message);
    else load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">مربیان</h1>
          <p className="page-subtitle">ثبت مربی، رشته تخصصی و درصد حق‌الزحمه</p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary">
          <UserPlus size={16} />
          مربی جدید
        </button>
      </div>

      <div className="panel-card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 skeleton" />)}</div>
        ) : coaches.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>مربی ثبت نشده است</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr style={{ background: 'var(--bg-muted)' }}>
                  {['نام', 'تلفن', 'رشته', 'درصد حق مربی', 'وضعیت', ''].map((h) => (
                    <th key={h || 'a'} className="text-right text-xs font-semibold px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coaches.map((c) => (
                  <tr key={c.id} className="table-row">
                    <td className="px-4 py-3.5">
                      <button type="button" onClick={() => openProfile(c)} className="flex items-center gap-3 hover:opacity-80">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold overflow-hidden" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                          {c.photo_url ? <img src={c.photo_url} alt="" className="w-full h-full object-cover" /> : c.full_name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.full_name}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }} dir="ltr">{c.phone || '—'}</td>
                    <td className="px-4 py-3.5"><span className="badge badge-info">{c.specialty || '—'}</span></td>
                    <td className="px-4 py-3.5 text-sm font-semibold" style={{ color: 'var(--text)' }}>{(Number(c.commission_percent) || 0).toLocaleString('fa-IR')}%</td>
                    <td className="px-4 py-3.5">
                      <span className={`badge ${c.is_active !== 0 ? 'badge-success' : 'badge-danger'}`}>{c.is_active !== 0 ? 'فعال' : 'غیرفعال'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-1 justify-end">
                        <button type="button" onClick={() => openProfile(c)} className="p-2 rounded-lg" style={{ color: 'var(--accent)' }}><Eye size={15} /></button>
                        <button type="button" onClick={() => openEdit(c)} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}><Pencil size={15} /></button>
                        <button type="button" onClick={() => handleDelete(c.id)} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15, 23, 42, 0.45)' }} onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', maxHeight: '92vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-5 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{editing ? 'ویرایش مربی' : 'ثبت مربی'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-xl" style={{ background: 'var(--bg-muted)' }}><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {formError && (
                <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>{formError}</div>
              )}
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>نام کامل *</label>
                <input className="input-field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>تلفن</label>
                <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>رشته تخصصی</label>
                <input className="input-field" placeholder="مثلاً بدنسازی، یوگا، کراس‌فیت" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>درصد حق مربی (پیش‌فرض)</label>
                <input type="number" min={0} max={100} className="input-field" value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>یادداشت</label>
                <textarea className="input-field min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                فعال
              </label>

              <ProfileExtrasFields
                value={{
                  has_insurance: form.has_insurance,
                  insurance_notes: form.insurance_notes,
                  referrer_name: form.referrer_name,
                  referral_source: form.referral_source,
                  training_goal: form.training_goal,
                  photo_url: form.photo_url,
                }}
                onChange={(v) =>
                  setForm({
                    ...form,
                    has_insurance: v.has_insurance,
                    insurance_notes: v.insurance_notes,
                    referrer_name: v.referrer_name,
                    referral_source: v.referral_source,
                    training_goal: v.training_goal,
                    photo_url: v.photo_url,
                  })
                }
              />
            </div>
            <div className="shrink-0 px-5 py-4 flex flex-row-reverse gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
              <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? '...' : editing ? 'ذخیره' : 'ثبت'}</button>
              <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>انصراف</button>
            </div>
          </form>
        </div>
      )}

      {profile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15, 23, 42, 0.45)' }} onClick={(e) => e.target === e.currentTarget && setProfile(null)}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', maxHeight: '90vh' }}>
            <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg,#0c8ce7,#006fc5)' }}>
              <div className="flex justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 overflow-hidden flex items-center justify-center text-white text-lg font-bold">
                    {profile.photo_url ? <img src={profile.photo_url} alt="" className="w-full h-full object-cover" /> : profile.full_name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{profile.full_name}</h2>
                    <p className="text-white/70 text-sm">{profile.specialty || 'بدون رشته'}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setProfile(null)} className="text-white/80"><X size={18} /></button>
              </div>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 100px)' }}>
              <div className="grid grid-cols-3 gap-2">
                <div className="panel-card p-3 text-center">
                  <Users size={14} className="mx-auto mb-1" style={{ color: 'var(--accent)' }} />
                  <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{(profile.stats?.member_count ?? 0).toLocaleString('fa-IR')}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>عضو</p>
                </div>
                <div className="panel-card p-3 text-center">
                  <Wallet size={14} className="mx-auto mb-1" style={{ color: 'var(--gold)' }} />
                  <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{(profile.stats?.total_monthly_fee ?? 0).toLocaleString('fa-IR')}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>جمع شهریه</p>
                </div>
                <div className="panel-card p-3 text-center">
                  <Percent size={14} className="mx-auto mb-1" style={{ color: 'var(--success)' }} />
                  <p className="text-lg font-bold" style={{ color: 'var(--success)' }}>{(profile.stats?.total_commission ?? 0).toLocaleString('fa-IR')}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>حق مربی</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <Row label="تلفن" value={profile.phone || '—'} />
                <Row label="درصد پیش‌فرض" value={`${(Number(profile.commission_percent) || 0).toLocaleString('fa-IR')}%`} />
                <Row label="بیمه ورزشی" value={profile.has_insurance ? (profile.insurance_notes || 'دارد') : 'ندارد'} />
                <Row label="نام معرف" value={profile.referrer_name || '—'} />
                <Row label="منبع آشنایی" value={profile.referral_source || '—'} />
                <Row label="هدف / تخصص تکمیلی" value={profile.training_goal || '—'} />
                <Row label="یادداشت" value={profile.notes || '—'} />
              </div>
              <PrintCardButton
                data={{
                  full_name: profile.full_name,
                  phone: profile.phone || undefined,
                  specialty: profile.specialty || undefined,
                  photo_url: profile.photo_url,
                  role: 'coach',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 px-3 rounded-xl gap-3" style={{ background: 'var(--bg-muted)' }}>
      <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-medium text-left" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}
