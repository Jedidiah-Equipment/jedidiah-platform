import { formatDate } from '@pkg/domain';
import type { ChangeEvent } from 'react';
import { useRef } from 'react';
import { DateFieldTrigger } from '@/components/form/fields/DateFieldTrigger';

export type ReadAtFieldProps = { value: Date | null; onChange: (value: Date | null) => void; disabled?: boolean };

/** The date-time picker package has no web build; the browser's own `datetime-local` input stands in. */
export function ReadAtField({ value, onChange, disabled = false }: ReadAtFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };

  return (
    <>
      <DateFieldTrigger
        disabled={disabled}
        hasErrors={false}
        label="Read At"
        onClear={() => onChange(null)}
        onOpen={openPicker}
        placeholder={`Now · ${formatDate(new Date(), 'medium')}`}
        value={value ? formatDate(value, 'medium') : ''}
      />
      <input
        aria-hidden
        disabled={disabled}
        max={toLocalInputValue(new Date())}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const picked = new Date(event.currentTarget.value);
          if (!Number.isNaN(picked.getTime())) onChange(picked);
        }}
        ref={inputRef}
        style={{ height: 1, left: -1000, opacity: 0, pointerEvents: 'none', position: 'fixed', top: -1000, width: 1 }}
        tabIndex={-1}
        type="datetime-local"
        value={toLocalInputValue(value ?? new Date())}
      />
    </>
  );
}

/** `datetime-local` speaks the browser's local wall time as 'YYYY-MM-DDTHH:mm'. */
function toLocalInputValue(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
