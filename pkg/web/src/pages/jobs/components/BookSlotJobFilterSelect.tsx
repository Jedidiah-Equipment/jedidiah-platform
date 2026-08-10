import type React from 'react';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import type { BookSlotJobFilter } from './book-slot-jobs.js';

const bookSlotJobFilterLabels = {
  active: 'Active jobs',
  all: 'All jobs',
  unscheduled: 'Unscheduled jobs',
} as const satisfies Record<BookSlotJobFilter, string>;

const filterOptions = Object.entries(bookSlotJobFilterLabels).map(([value, label]) => ({
  label,
  value: value as BookSlotJobFilter,
}));

export const BookSlotJobFilterSelect: React.FC<{
  disabled?: boolean;
  onValueChange: (filter: BookSlotJobFilter) => void;
  value: BookSlotJobFilter;
}> = ({ disabled, onValueChange, value }) => (
  <Field>
    <FieldLabel htmlFor="book-slot-job-filter">Jobs shown</FieldLabel>
    <Select disabled={disabled} onValueChange={(filter) => onValueChange(filter as BookSlotJobFilter)} value={value}>
      <SelectTrigger id="book-slot-job-filter" className="w-full">
        <SelectValue>{bookSlotJobFilterLabels[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          {filterOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
);
