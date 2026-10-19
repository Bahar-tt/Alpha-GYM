import { useEffect, useRef, useState } from 'react';
import type { Coach } from '../services/coachService';

/** لیست باز: نام + رشته | مقدار بسته‌شده: فقط نام */
export default function CoachPicker({
  coaches,
  valueId,
  displayName,
  onSelect,
}: {
  coaches: Coach[];
  valueId: string;
  displayName: string;
  onSelect: (c: Coach | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = coaches.find((c) => String(c.id) === valueId);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="input-field w-full text-right flex items-center justify-between gap-2"
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ color: selected || displayName ? 'var(--text)' : 'var(--text-muted)' }}>
          {selected?.full_name || displayName || 'انتخاب مربی'}
        </span>
        <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul
          className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border shadow-lg"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
        >
          <li>
            <button
              type="button"
              className="w-full text-right px-3 py-2 text-sm hover:opacity-90"
              style={{ color: 'var(--text-muted)' }}
              onClick={() => { onSelect(null); setOpen(false); }}
            >
              بدون مربی
            </button>
          </li>
          {coaches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full text-right px-3 py-2.5 text-sm border-t"
                style={{
                  borderColor: 'var(--border)',
                  background: String(c.id) === valueId ? 'var(--accent-soft)' : 'transparent',
                  color: 'var(--text)',
                }}
                onClick={() => { onSelect(c); setOpen(false); }}
              >
                <span className="font-medium">{c.full_name}</span>
                {c.specialty ? (
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{c.specialty}</span>
                ) : null}
              </button>
            </li>
          ))}
          {coaches.length === 0 && (
            <li className="px-3 py-3 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              ابتدا مربی ثبت کنید
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
