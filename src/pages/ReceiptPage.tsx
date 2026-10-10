import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getReceiptByToken, type Receipt } from '../services/receiptService';
import { formatJalali } from '../lib/jalaliDate';
import { Printer, ArrowRight } from 'lucide-react';

const typeLabels: Record<string, string> = {
  registration: 'ثبت‌نام اولیه',
  renewal: 'تمدید عضویت',
  other: 'سایر',
};

export default function ReceiptPage() {
  const { token } = useParams<{ token: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error: err } = await getReceiptByToken(token);
      if (err) setError(err.message);
      else setReceipt(data);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6" style={{ background: 'var(--bg)' }}>
        <p style={{ color: 'var(--danger)' }}>{error || 'فیش یافت نشد'}</p>
        <Link to="/login" className="text-sm" style={{ color: 'var(--accent)' }}>
          بازگشت
        </Link>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen p-4 sm:p-8" style={{ background: 'var(--bg)', fontFamily: 'Vazirmatn, Tahoma, sans-serif' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="max-w-md mx-auto space-y-4">
        <div className="no-print flex justify-between items-center">
          <Link to="/" className="text-sm flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <ArrowRight size={14} /> بازگشت
          </Link>
          <button type="button" className="btn-primary py-2 px-3 text-sm" onClick={() => window.print()}>
            <Printer size={14} /> چاپ فیش
          </button>
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
        >
          <div className="px-6 py-5 flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#0c8ce7,#006fc5)' }}>
            <img src="/v5.png" alt="" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-white font-bold text-lg">فیش مالی Alpha GYM</h1>
              <p className="text-white/70 text-xs">رسید رسمی باشگاه</p>
            </div>
          </div>

          <div className="p-6 space-y-3 text-sm">
            <Row label="شماره فیش" value={`AG-${receipt.id}`} />
            <Row label="نوع" value={typeLabels[receipt.type] || receipt.type} />
            <Row label="نام" value={receipt.member_name || '—'} />
            <Row label="تلفن" value={receipt.phone || '—'} />
            {receipt.period_start && <Row label="از تاریخ" value={formatJalali(receipt.period_start)} />}
            {receipt.period_end && <Row label="تا تاریخ" value={formatJalali(receipt.period_end)} />}
            {receipt.months > 0 && <Row label="مدت" value={`${receipt.months.toLocaleString('fa-IR')} ماه`} />}
            {receipt.description && <Row label="توضیح" value={receipt.description} />}
            <div
              className="flex justify-between items-center p-4 rounded-xl mt-2"
              style={{ background: 'var(--accent-soft)' }}
            >
              <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                مبلغ
              </span>
              <span className="text-xl font-extrabold" style={{ color: 'var(--accent)' }}>
                {Math.round(receipt.amount).toLocaleString('fa-IR')} تومان
              </span>
            </div>
            <p className="text-[11px] text-center pt-2" style={{ color: 'var(--text-muted)' }}>
              تاریخ صدور:{' '}
              {receipt.created_at
                ? new Date(receipt.created_at).toLocaleString('fa-IR')
                : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-medium text-left" style={{ color: 'var(--text)' }}>
        {value}
      </span>
    </div>
  );
}
