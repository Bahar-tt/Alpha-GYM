import { useState } from 'react';
import { CreditCard, Printer, X } from 'lucide-react';
import MembershipCard, { type CardData } from './MembershipCard';

export default function PrintCardButton({ data }: { data: CardData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-outline text-xs py-2" onClick={() => setOpen(true)}>
        <CreditCard size={14} />
        چاپ کارت عضویت
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.5)' }}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <div className="flex justify-between items-center no-print">
              <h3 className="font-bold" style={{ color: 'var(--text)' }}>
                پیش‌نمایش کارت
              </h3>
              <button type="button" onClick={() => setOpen(false)}>
                <X size={18} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <MembershipCard data={data} />
            <div className="flex gap-2 no-print">
              <button type="button" className="btn-primary flex-1" onClick={() => window.print()}>
                <Printer size={16} />
                چاپ
              </button>
              <button type="button" className="btn-outline" onClick={() => setOpen(false)}>
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
