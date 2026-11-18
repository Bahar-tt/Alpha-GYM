import { useState } from 'react';
import { KeyRound, CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiPost } from '../services/api';

export default function ProfileSettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setSuccess('');
    if (newPassword.length < 6) { setError('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.'); return; }
    if (newPassword !== confirmPassword) { setError('تکرار رمز عبور با رمز جدید یکسان نیست.'); return; }
    setBusy(true);
    const result = await apiPost<{ ok: boolean }>('/auth/change-password', { current_password: currentPassword, new_password: newPassword });
    if (result.error) setError(result.error); else { setSuccess('رمز عبور با موفقیت تغییر کرد.'); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }
    setBusy(false);
  };

  return (
    <div className="space-y-6 max-w-2xl" dir="rtl">
      <div className="page-hero"><h1 className="page-title">تغییر رمز عبور</h1><p className="page-subtitle">رمز عبور حساب کاربری خود را مدیریت کنید</p></div>
      {error && <div className="rounded-xl p-3 text-sm flex items-center gap-2" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><AlertTriangle size={17} />{error}</div>}
      {success && <div className="rounded-xl p-3 text-sm flex items-center gap-2" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}><CheckCircle2 size={17} />{success}</div>}
      <form onSubmit={submit} className="panel-card p-6 space-y-4">
        <h2 className="section-title flex items-center gap-2"><KeyRound size={18} style={{ color: 'var(--accent)' }} />تغییر رمز حساب</h2>
        <label className="block text-sm" style={{ color: 'var(--text-secondary)' }}>رمز عبور فعلی<input className="input-field mt-1" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
        <label className="block text-sm" style={{ color: 'var(--text-secondary)' }}>رمز عبور جدید<input className="input-field mt-1" type="password" autoComplete="new-password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label>
        <label className="block text-sm" style={{ color: 'var(--text-secondary)' }}>تکرار رمز عبور جدید<input className="input-field mt-1" type="password" autoComplete="new-password" minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>
        <button type="submit" className="btn-primary" disabled={busy}><KeyRound size={16} />{busy ? 'در حال ذخیره…' : 'ذخیره رمز جدید'}</button>
      </form>
    </div>
  );
}
