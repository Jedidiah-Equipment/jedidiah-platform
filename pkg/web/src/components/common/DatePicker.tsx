import { formatDate, parseCommonDateInput } from '@pkg/domain';
import { endOfDay, format, isAfter, isBefore, isValid, parse, startOfDay } from 'date-fns';
import * as React from 'react';
import { Calendar } from '@/components/ui/calendar.js';
import { Input } from '@/components/ui/input.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';

const dateOnlyFormat = 'yyyy-MM-dd';

export type DatePickerProps = {
  'aria-invalid'?: boolean;
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
  const [open, setOpenState] = React.useState(false);
  const openRef = React.useRef(open);
  const selectedDate = React.useMemo(() => parseDatePickerValue(value), [value]);
  const minDate = React.useMemo(() => (minValue ? parseDatePickerValue(minValue) : null), [minValue]);
  const maxDate = React.useMemo(() => (maxValue ? parseDatePickerValue(maxValue) : null), [maxValue]);
  const [calendarMonth, setCalendarMonth] = React.useState(() => selectedDate ?? undefined);
  const [displayValue, setDisplayValue] = React.useState(() => formatDatePickerInputValue(value));
  const setOpen = React.useCallback((nextOpen: boolean, eventDetails?: { reason: string }) => {
    if (openRef.current && !nextOpen && eventDetails?.reason === 'trigger-press') return;

    openRef.current = nextOpen;
    setOpenState(nextOpen);
  }, []);
  React.useEffect(() => {
    setDisplayValue(formatDatePickerInputValue(value));
  }, [value]);

  React.useEffect(() => {
    if (!selectedDate) return;

    setCalendarMonth(selectedDate);
  }, [selectedDate]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        nativeButton={false}
        render={
          <div className="w-full">
            <Input
              aria-invalid={ariaInvalid}
              disabled={disabled}
              id={id}
              name={name}
              onBlur={(event) => {
                const nextValue = parseDatePickerInputValue(event.target.value);

                if (nextValue && isDatePickerValueAllowed(nextValue, { maxDate, minDate })) {
                  const nextDate = parseDatePickerValue(nextValue);
                  onChange(nextValue);
                  setDisplayValue(formatDatePickerInputValue(nextValue));
                  setCalendarMonth(nextDate ?? undefined);
                } else if (event.target.value.trim() === '') {
                  onChange('');
                  setDisplayValue('');
                } else {
                  setDisplayValue(formatDatePickerInputValue(value));
                }

                onBlur?.(event);
              }}
              onChange={(event) => setDisplayValue(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder={placeholder}
              value={displayValue}
            />
          </div>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          disabled={createDatePickerDisabledMatchers({ maxDate, minDate })}
          mode="single"
          selected={selectedDate ?? undefined}
          onMonthChange={setCalendarMonth}
          onSelect={(date) => {
            if (!date) return;

            setCalendarMonth(date);
            onChange(formatDatePickerValue(date));
            setOpen(false);
          }}
          {...(calendarMonth ? { month: calendarMonth } : {})}
        />
      </PopoverContent>
    </Popover>
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
  const parsedDate = parseCommonDateInput(value);

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
