import type * as React from 'react';

import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

type SelectFieldOption = {
  label: React.ReactNode;
  value: string;
};

const EMPTY_SELECT_VALUE = '__empty__';

export type SelectFieldProps = {
  disabled?: boolean;
  emptyLabel?: React.ReactNode;
  label: React.ReactNode;
  onValueCommit?: (value: string) => void;
  onValueSelect?: (value: string) => boolean | undefined;
  options: readonly SelectFieldOption[];
  placeholder?: string;
};

export function SelectField({
  disabled = false,
  emptyLabel,
  label,
  onValueCommit,
  onValueSelect,
  options,
  placeholder,
}: SelectFieldProps) {
  const field = useFieldContext<string>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;
  const selectedOption = options.find((option) => option.value === field.state.value);
  const selectValue = emptyLabel && field.state.value === '' ? EMPTY_SELECT_VALUE : field.state.value;
  const selectedLabel = emptyLabel && field.state.value === '' ? emptyLabel : selectedOption?.label;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Select
        disabled={disabled}
        onValueChange={(value) => {
          const nextValue = value === EMPTY_SELECT_VALUE ? '' : (value ?? '');
          if (nextValue === field.state.value || onValueSelect?.(nextValue) === false) return;

          field.handleChange(nextValue);
          onValueCommit?.(nextValue);
        }}
        value={selectValue}
      >
        <SelectTrigger id={field.name} className="w-full">
          <SelectValue placeholder={placeholder}>{selectedLabel ?? null}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {emptyLabel ? <SelectItem value={EMPTY_SELECT_VALUE}>{emptyLabel}</SelectItem> : null}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldError errors={fieldErrors} />
    </Field>
  );
}
