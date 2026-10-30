import * as React from 'react';

import { DatePicker } from '@/components/common/DatePicker.js';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';
import { WRONG_TIME_MESSAGE } from '../utils/form-schema.js';

export type DateTimePickerFieldProps = {
  description?: React.ReactNode;
  disabled?: boolean;
  label: React.ReactNode;
  /** The latest date the calendar offers, as 'YYYY-MM-DD'. */
  maxValue?: string;
  placeholder?: string;
};

/**
 * A local date and time held as 'YYYY-MM-DDTHH:mm', blank while either half is: the app's date picker beside a 24-hour
 * time typed as HH:mm. Picking a date with no time yet fills in the current time so the value is never half set. The
 * time reaches the form as it is typed, a wrong one as typed, so validate the field with `localDateTimeValue`.
 */
export function DateTimePickerField(props: DateTimePickerFieldProps) {
  const field = useFieldContext<string>();
  return (
    <DateTimeInput
      {...props}
      errors={getFieldErrors(field.state.meta.errors)}
      name={field.name}
      onBlur={field.handleBlur}
      onChange={field.handleChange}
      value={field.state.value}
    />
  );
}

/** {@link DateTimePickerField} held by its caller rather than a form field; `errors` are the caller's own. */
export function DateTimeInput({
  description,
  disabled = false,
  errors = [],
  label,
  maxValue,
  name,
  onBlur,
  onChange,
  placeholder,
  value,
}: DateTimePickerFieldProps & {
  errors?: { message?: string }[];
  name: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  value: string;
}) {
  const [date = '', time = ''] = value.split('T');
  // What is typed in the time box, shown as typed until it blurs as a valid time.
  const [typedTime, setTypedTime] = React.useState<string | null>(null);
  const typedWrong = typedTime !== null && typedTime.trim() !== '' && !parseTimeInput(typedTime);
  // The form only shows its errors once submitted; a wrong time says so as soon as it is typed.
  const fieldErrors = typedWrong && errors.length === 0 ? [{ message: WRONG_TIME_MESSAGE }] : errors;
  const isInvalid = fieldErrors.length > 0;
  const change = (nextDate: string, nextTime: string) =>
    onChange(nextDate && nextTime ? `${nextDate}T${nextTime}` : '');

  return (
    <Field data-disabled={disabled} data-invalid={isInvalid}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <DatePicker
          aria-invalid={isInvalid}
          disabled={disabled}
          id={name}
          {...(maxValue ? { maxValue } : {})}
          name={name}
          onBlur={() => onBlur?.()}
          onChange={(nextDate) => change(nextDate, time || localNow()[1])}
          value={date}
          {...(placeholder ? { placeholder } : {})}
        />
        <Input
          aria-invalid={isInvalid}
          aria-label="Time"
          disabled={disabled}
          inputMode="numeric"
          name={`${name}-time`}
          onBlur={() => {
            if (typedTime !== null && (typedTime.trim() === '' || parseTimeInput(typedTime))) setTypedTime(null);
            onBlur?.();
          }}
          onChange={(event) => {
            const typed = event.target.value;
            setTypedTime(typed);
            if (typed.trim() === '') change('', '');
            else change(date || localNow()[0], parseTimeInput(typed) ?? typed.trim());
          }}
          placeholder="HH:mm"
          value={typedTime ?? time}
        />
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={fieldErrors} />
    </Field>
  );
}

const pad = (part: number) => String(part).padStart(2, '0');

/** Today and the time now on the browser's clock, as the field's two halves. */
function localNow(): [date: string, time: string] {
  const now = new Date();
  return [
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  ];
}

/** A typed 24-hour time — '7:05', '07.05', '0705' or '7' — as 'HH:mm'; anything else is null. */
export function parseTimeInput(value: string): string | null {
  const match = /^(\d{1,2})(?:[:.h]?(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  return hours < 24 && minutes < 60 ? `${pad(hours)}:${pad(minutes)}` : null;
}
