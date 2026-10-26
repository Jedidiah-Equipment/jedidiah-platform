import * as React from 'react';

import { DatePicker } from '@/components/common/DatePicker.js';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

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
 * time typed as HH:mm. Picking a date with no time yet fills in the current time so the value is never half set.
 */
export function DateTimePickerField({
  description,
  disabled = false,
  label,
  maxValue,
  placeholder,
}: DateTimePickerFieldProps) {
  const field = useFieldContext<string>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;
  const [date = '', time = ''] = field.state.value.split('T');
  // What is typed in the time box, kept only until it blurs; otherwise the box shows the saved time.
  const [typedTime, setTypedTime] = React.useState<string | null>(null);
  const change = (nextDate: string, nextTime: string) =>
    field.handleChange(nextDate && nextTime ? `${nextDate}T${nextTime}` : '');

  return (
    <Field data-disabled={disabled} data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <DatePicker
          aria-invalid={isInvalid}
          disabled={disabled}
          id={field.name}
          {...(maxValue ? { maxValue } : {})}
          name={field.name}
          onBlur={field.handleBlur}
          onChange={(nextDate) => change(nextDate, time || localNow()[1])}
          value={date}
          {...(placeholder ? { placeholder } : {})}
        />
        <Input
          aria-invalid={isInvalid}
          aria-label="Time"
          disabled={disabled}
          inputMode="numeric"
          name={`${field.name}-time`}
          onBlur={() => {
            if (typedTime !== null) {
              const nextTime = parseTimeInput(typedTime);
              if (nextTime) change(date || localNow()[0], nextTime);
              else if (typedTime.trim() === '') change('', '');
              setTypedTime(null);
            }
            field.handleBlur();
          }}
          onChange={(event) => setTypedTime(event.target.value)}
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
