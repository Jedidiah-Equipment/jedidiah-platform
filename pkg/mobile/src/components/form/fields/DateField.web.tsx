import type { ChangeEvent, ReactNode } from 'react';
import { useRef } from 'react';

import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { DateFieldTrigger } from './DateFieldTrigger';
import { FieldShell } from './FieldShell';

export type DateFieldProps = {
  disabled?: boolean;
  label: ReactNode;
  onValueCommit?: () => void;
  placeholder?: string;
};

export function DateField({ disabled = false, label, onValueCommit, placeholder = 'Select date' }: DateFieldProps) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);
  const inputRef = useRef<HTMLInputElement>(null);
  const value = field.state.value.slice(0, 10);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;

    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };

  return (
    <FieldShell errors={errors} label={label}>
      <DateFieldTrigger
        disabled={disabled}
        hasErrors={errors.length > 0}
        label={label}
        onClear={() => {
          field.handleChange('');
          onValueCommit?.();
        }}
        onOpen={openPicker}
        placeholder={placeholder}
        value={value}
      />
      <input
        aria-hidden
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          field.handleChange(event.currentTarget.value);
          onValueCommit?.();
        }}
        ref={inputRef}
        style={{ height: 1, left: -1000, opacity: 0, pointerEvents: 'none', position: 'fixed', top: -1000, width: 1 }}
        tabIndex={-1}
        type="date"
        value={value}
      />
    </FieldShell>
  );
}
