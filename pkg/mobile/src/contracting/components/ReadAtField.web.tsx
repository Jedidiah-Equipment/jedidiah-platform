import { formatDate } from '@pkg/domain';
import { readAtFromInput, readAtInputValue } from '@pkg/domain/contracting';
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
        max={readAtInputValue(new Date())}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const picked = readAtFromInput(event.currentTarget.value);
          if (picked) onChange(picked);
        }}
        ref={inputRef}
        style={{ height: 1, left: -1000, opacity: 0, pointerEvents: 'none', position: 'fixed', top: -1000, width: 1 }}
        tabIndex={-1}
        type="datetime-local"
        value={readAtInputValue(value ?? new Date())}
      />
    </>
  );
}
