import { formatJalali } from '../lib/jalaliDate';

export interface CardData {
  full_name: string;
  father_name?: string;
  national_id?: string;
  phone?: string;
  personnel_code?: string;
  birthday?: string;
  membership_type?: string;
  end_date?: string;
  coach_name?: string;
  specialty?: string;
  sport?: string;
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
          width: 380,
          minHeight: 240,
          borderRadius: 18,
          overflow: 'hidden',
          background: 'linear-gradient(145deg, #0b1220 0%, #0c4a6e 50%, #0c8ce7 100%)',
          color: '#fff',
          fontFamily: 'Vazirmatn, Tahoma, sans-serif',
          boxShadow: '0 16px 48px rgba(12,140,231,0.3)',
          direction: 'rtl',
        }}
      >
        <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <img src="/v5.png" alt="logo" style={{ width: 34, height: 34, objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{gym}</div>
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

        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 14 }}>
          <div
            style={{
              width: 80,
              height: 96,
              borderRadius: 12,
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
          <div style={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.65 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{data.full_name}</div>
            {data.father_name && <div style={{ opacity: 0.85 }}>نام پدر: {data.father_name}</div>}
            {data.national_id && (
              <div style={{ opacity: 0.85 }} dir="ltr">
                کد ملی: {data.national_id}
              </div>
            )}
            {data.personnel_code && (
              <div style={{ opacity: 0.85 }} dir="ltr">
                کد پرسنلی: {data.personnel_code}
              </div>
            )}
            {data.birthday && <div style={{ opacity: 0.85 }}>تولد: {data.birthday}</div>}
            {role === 'member' && data.end_date && (
              <div style={{ marginTop: 4, color: '#f5d78e', fontWeight: 700 }}>
                اعتبار تا {formatJalali(data.end_date)}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.12)',
            padding: '8px 16px',
            fontSize: 10,
            opacity: 0.7,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Alpha GYM</span>
          <span>قابل ارائه در پذیرش</span>
        </div>
      </div>
    </div>
  );
}
