import { formatJalali } from '../lib/jalaliDate';

export interface CardData {
  full_name: string;
  phone?: string;
  personnel_code?: string;
  membership_type?: string;
  end_date?: string;
  coach_name?: string;
  specialty?: string;
  photo_url?: string | null;
  role?: 'member' | 'coach';
  gymName?: string;
}

const typeLabels: Record<string, string> = {
  monthly: 'ماهانه',
  quarterly: 'سه‌ماهه',
  yearly: 'سالانه',
  vip: 'VIP',
};

/** کارت عضویت آماده چاپ — در مودال یا صفحه جدا */
export default function MembershipCard({ data }: { data: CardData }) {
  const gym = data.gymName || 'Alpha GYM';
  const role = data.role || 'member';

  return (
    <div className="membership-card-print">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .membership-card-print, .membership-card-print * { visibility: visible !important; }
          .membership-card-print {
            position: fixed !important;
            inset: 0 !important;
            margin: auto !important;
            box-shadow: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      <div
        style={{
          width: 340,
          minHeight: 210,
          borderRadius: 16,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #0b1220 0%, #0c4a6e 55%, #0c8ce7 100%)',
          color: '#fff',
          fontFamily: 'Vazirmatn, Tahoma, sans-serif',
          boxShadow: '0 12px 40px rgba(12,140,231,0.25)',
          direction: 'rtl',
        }}
      >
        <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <img src="/v5.png" alt="logo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{gym}</div>
              <div style={{ fontSize: 10, opacity: 0.75 }}>
                {role === 'coach' ? 'کارت مربی' : 'کارت عضویت'}
              </div>
            </div>
          </div>
          <div
            style={{
              fontSize: 10,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(212,168,67,0.25)',
              color: '#f5d78e',
              fontWeight: 700,
            }}
          >
            {role === 'coach'
              ? data.specialty || 'مربی'
              : typeLabels[data.membership_type || ''] || data.membership_type || 'عضو'}
          </div>
        </div>

        <div style={{ padding: '0 16px 16px', display: 'flex', gap: 14, alignItems: 'center' }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.12)',
              border: '2px solid rgba(255,255,255,0.25)',
              overflow: 'hidden',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            {data.photo_url ? (
              <img src={data.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              (data.full_name || '?').charAt(0)
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{data.full_name}</div>
            {data.phone && (
              <div style={{ fontSize: 12, opacity: 0.85, direction: 'ltr', textAlign: 'right' }}>{data.phone}</div>
            )}
            {data.personnel_code && (
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }} dir="ltr">
                کد: {data.personnel_code}
              </div>
            )}
            {role === 'member' && data.end_date && (
              <div style={{ fontSize: 11, marginTop: 6, color: '#f5d78e' }}>
                اعتبار تا {formatJalali(data.end_date)}
              </div>
            )}
            {role === 'member' && data.coach_name && (
              <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>مربی: {data.coach_name}</div>
            )}
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.12)',
            padding: '8px 16px',
            fontSize: 10,
            opacity: 0.65,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>alphagym</span>
          <span>قابل ارائه در پذیرش</span>
        </div>
      </div>
    </div>
  );
}
