import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  type JalaliDate,
  jalaliMonthNames,
  jalaliDaysInMonth,
  jalaliToGregorianIso,
  todayJalali,
  compareJalali,
} from '../lib/jalaliDate';

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

function formatDisplay(d: JalaliDate | null): string {
  if (!d) return '';
  return `${d.year}/${String(d.month).padStart(2, '0')}/${String(d.day).padStart(2, '0')}`;
}

/** شنبه = ۰ … جمعه = ۶ */
function jalaliWeekdayIndex(date: JalaliDate): number {
  const iso = jalaliToGregorianIso(date);
  const [y, m, d] = iso.split('-').map(Number);
  const jsDay = new Date(y, m - 1, d).getDay(); // 0=یکشنبه … 6=شنبه
  return (jsDay + 1) % 7;
}

function buildMonthGrid(year: number, month: number): (number | null)[] {
  const daysInMonth = jalaliDaysInMonth(year, month);
  const startOffset = jalaliWeekdayIndex({ year, month, day: 1 });
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export interface JalaliDatePickerProps {
  label: string;
  value: JalaliDate | null;
  onChange: (date: JalaliDate | null) => void;
  min?: JalaliDate;
  max?: JalaliDate;
  required?: boolean;
  allowClear?: boolean;
  placeholder?: string;
}

export default function JalaliDatePicker({
  label,
  value,
  onChange,
  min,
  max,
  required,
  allowClear = false,
  placeholder = 'انتخاب تاریخ',
}: JalaliDatePickerProps) {
  const today = todayJalali();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(value?.year ?? today.year);
  const [viewMonth, setViewMonth] = useState(value?.month ?? today.month);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      setViewYear(value.year);
      setViewMonth(value.month);
    }
  }, [value?.year, value?.month, value?.day]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const isDisabled = (day: number) => {
    const d: JalaliDate = { year: viewYear, month: viewMonth, day };
    if (min && compareJalali(d, min) < 0) return true;
    if (max && compareJalali(d, max) > 0) return true;
    return false;
  };

  const isSelected = (day: number) =>
    !!value && value.year === viewYear && value.month === viewMonth && value.day === day;

  const isToday = (day: number) =>
    today.year === viewYear && today.month === viewMonth && today.day === day;

  const pick = (day: number) => {
    if (isDisabled(day)) return;
    onChange({ year: viewYear, month: viewMonth, day });
    setOpen(false);
  };

  const cells = buildMonthGrid(viewYear, viewMonth);

  const years = Array.from({ length: 80 }, (_, i) => today.year - 60 + i);

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        {label}
        {required && <span style={{ color: 'var(--danger)' }}> *</span>}
      </label>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-field flex items-center gap-2 text-right w-full cursor-pointer"
        style={{ minHeight: 44 }}
      >
        <Calendar size={16} className="shrink-0" style={{ color: 'var(--accent)' }} />
        <span
          className="flex-1 text-sm"
          style={{ color: value ? 'var(--text)' : 'var(--text-muted)' }}
        >
          {value ? formatDisplay(value) : placeholder}
        </span>
        {allowClear && value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                onChange(null);
              }
            }}
            className="p-0.5 rounded"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-[80] mt-2 w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl p-3 shadow-lg"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
            left: 0,
          }}
        >
          {/* Header: month / year */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-muted)' }}
              aria-label="ماه بعد"
            >
              <ChevronRight size={16} />
            </button>

            <div className="flex items-center gap-1.5 flex-1 justify-center">
              <select
                className="text-sm font-semibold rounded-lg px-2 py-1 border-0 outline-none cursor-pointer"
                style={{ background: 'var(--bg-muted)', color: 'var(--text)' }}
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
              >
                {jalaliMonthNames.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className="text-sm font-semibold rounded-lg px-2 py-1 border-0 outline-none cursor-pointer"
                style={{ background: 'var(--bg-muted)', color: 'var(--text)' }}
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-muted)' }}
              aria-label="ماه قبل"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Weekdays */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="h-8 flex items-center justify-center text-[11px] font-semibold"
                style={{ color: 'var(--text-muted)' }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`e-${idx}`} className="h-9" />;
              }
              const disabled = isDisabled(day);
              const selected = isSelected(day);
              const todayCell = isToday(day);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(day)}
                  className="h-9 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: selected
                      ? 'var(--accent)'
                      : todayCell
                        ? 'var(--accent-soft)'
                        : 'transparent',
                    color: selected
                      ? '#fff'
                      : disabled
                        ? 'var(--text-muted)'
                        : todayCell
                          ? 'var(--accent)'
                          : 'var(--text)',
                    opacity: disabled ? 0.35 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontWeight: selected || todayCell ? 700 : 500,
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              className="text-xs font-medium px-2 py-1 rounded-lg"
              style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
              onClick={() => {
                if (min && compareJalali(today, min) < 0) return;
                if (max && compareJalali(today, max) > 0) return;
                onChange({ ...today });
                setViewYear(today.year);
                setViewMonth(today.month);
                setOpen(false);
              }}
            >
              امروز
            </button>
            {allowClear && (
              <button
                type="button"
                className="text-xs font-medium px-2 py-1 rounded-lg"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                پاک کردن
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function formatJalaliDate(d: JalaliDate | null): string {
  return formatDisplay(d);
}
