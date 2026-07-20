import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Platform } from 'react-native';

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
  const [open, setOpen] = useState(false);

  const change = (event: DateTimePickerEvent, date?: Date) => {
    setOpen(false);
    if (event.type !== 'set' || !date) return;

    field.handleChange(toDateOnly(date));
    onValueCommit?.();
  };

  return (
    <FieldShell errors={errors} label={label}>
      <DateFieldTrigger
        disabled={disabled}
        expanded={open}
        hasErrors={errors.length > 0}
        label={label}
        onClear={() => {
          field.handleChange('');
          onValueCommit?.();
        }}
        onOpen={() => setOpen(true)}
        placeholder={placeholder}
        value={field.state.value}
      />
      {open ? (
        <DateTimePicker
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          mode="date"
          onChange={change}
          value={fromDateOnly(field.state.value)}
        />
      ) : null}
    </FieldShell>
  );
}

function fromDateOnly(value: string): Date {
  const date = value ? new Date(`${value.slice(0, 10)}T12:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
