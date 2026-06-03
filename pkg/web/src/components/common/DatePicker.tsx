import { formatDate } from '@pkg/domain';
import { endOfDay, format, isAfter, isBefore, isValid, parse, startOfDay } from 'date-fns';
import { CalendarIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button.js';
import { Calendar } from '@/components/ui/calendar.js';
import { Input } from '@/components/ui/input.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';

const dateOnlyFormat = 'yyyy-MM-dd';

export type DatePickerProps = {
  'aria-invalid'?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  maxValue?: string;
  minValue?: string;
  name?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

export function DatePicker({
  'aria-invalid': ariaInvalid = false,
  clearable = false,
  disabled = false,
  id,
  maxValue,
  minValue,
  name,
  onBlur,
  onChange,
  placeholder = 'Select date',
  value,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = parseDatePickerValue(value);
  const minDate = minValue ? parseDatePickerValue(minValue) : null;
  const maxDate = maxValue ? parseDatePickerValue(maxValue) : null;
  const [displayValue, setDisplayValue] = React.useState(() => formatDatePickerInputValue(value));

  React.useEffect(() => {
    setDisplayValue(formatDatePickerInputValue(value));
  }, [value]);

  return (
    <div className="flex gap-1.5">
      <Input
        aria-invalid={ariaInvalid}
        disabled={disabled}
        id={id}
        name={name}
        onBlur={(event) => {
          const nextValue = parseDatePickerInputValue(event.target.value);

          if (nextValue && isDatePickerValueAllowed(nextValue, { maxDate, minDate })) {
            onChange(nextValue);
            setDisplayValue(formatDatePickerInputValue(nextValue));
          } else if (event.target.value.trim() === '') {
            onChange('');
            setDisplayValue('');
          } else {
            setDisplayValue(formatDatePickerInputValue(value));
          }

          onBlur?.(event);
        }}
        onChange={(event) => setDisplayValue(event.target.value)}
        placeholder={placeholder}
        value={displayValue}
      />
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={<Button aria-label="Select date" disabled={disabled} size="icon" type="button" variant="outline" />}
        >
          <CalendarIcon />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            disabled={createDatePickerDisabledMatchers({ maxDate, minDate })}
            mode="single"
            selected={selectedDate ?? undefined}
            onSelect={(date) => {
              if (!date) return;

              onChange(formatDatePickerValue(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && value && !disabled ? (
        <Button aria-label="Clear date" onClick={() => onChange('')} size="icon" type="button" variant="outline">
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}

export function formatDatePickerInputValue(value: string): string {
  const date = parseDatePickerValue(value);

  return date ? formatDatePickerDisplayValue(date) : '';
}

export function parseDatePickerValue(value: string): Date | null {
  if (value === '') return null;

  const parsedDate = parse(value, dateOnlyFormat, new Date());

  if (!isValid(parsedDate)) return null;

  return format(parsedDate, dateOnlyFormat) === value ? parsedDate : null;
}

export function formatDatePickerValue(date: Date): string {
  return format(date, dateOnlyFormat);
}

export function formatDatePickerDisplayValue(date: Date): string {
  return formatDate(date, 'short');
}

export function parseDatePickerInputValue(value: string): string | null {
  const trimmedValue = value.trim();
  if (trimmedValue === '') return null;

  const parsedDate = [parse(trimmedValue, 'PP', new Date()), parse(trimmedValue, dateOnlyFormat, new Date())].find(
    (candidate) => isValid(candidate),
  );

  if (!parsedDate) return null;

  return formatDatePickerValue(parsedDate);
}

function isDatePickerValueAllowed(value: string, { maxDate, minDate }: { maxDate: Date | null; minDate: Date | null }) {
  const date = parseDatePickerValue(value);

  if (!date) return false;
  if (minDate && isBefore(date, startOfDay(minDate))) return false;
  if (maxDate && isAfter(date, endOfDay(maxDate))) return false;

  return true;
}

function createDatePickerDisabledMatchers({ maxDate, minDate }: { maxDate: Date | null; minDate: Date | null }) {
  return [...(minDate ? [{ before: startOfDay(minDate) }] : []), ...(maxDate ? [{ after: endOfDay(maxDate) }] : [])];
}
