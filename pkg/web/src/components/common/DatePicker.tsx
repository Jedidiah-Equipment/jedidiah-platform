import { format, isValid, parse } from 'date-fns';
import { CalendarIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button.js';
import { Calendar } from '@/components/ui/calendar.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { formatDate } from '@/utils/date.js';

const dateOnlyFormat = 'yyyy-MM-dd';

export type DatePickerProps = {
  'aria-invalid'?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

export function DatePicker({
  'aria-invalid': ariaInvalid = false,
  clearable = false,
  disabled = false,
  id,
  name,
  onBlur,
  onChange,
  placeholder = 'Select date',
  value,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = parseDatePickerValue(value);

  return (
    <div className="flex gap-1.5">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              aria-invalid={ariaInvalid}
              className="min-w-0 flex-1 justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
              data-empty={!selectedDate}
              disabled={disabled}
              id={id}
              name={name}
              onBlur={onBlur}
              type="button"
              variant="outline"
            />
          }
        >
          <CalendarIcon data-icon="inline-start" />
          <span className="truncate">{selectedDate ? formatDatePickerDisplayValue(selectedDate) : placeholder}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
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
