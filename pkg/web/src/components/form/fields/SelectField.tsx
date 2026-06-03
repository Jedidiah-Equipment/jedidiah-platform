import type * as React from 'react';

import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

type SelectFieldOption = {
  label: React.ReactNode;
  value: string;
};

export type SelectFieldProps = {
  disabled?: boolean;
  label: React.ReactNode;
  onValueCommit?: () => void;
  options: readonly SelectFieldOption[];
  placeholder?: string;
};

export function SelectField({ disabled = false, label, onValueCommit, options, placeholder }: SelectFieldProps) {
  const field = useFieldContext<string>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;
  const selectedOption = options.find((option) => option.value === field.state.value);

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Select
        disabled={disabled}
        onValueChange={(value) => {
          field.handleChange(value ?? '');
          onValueCommit?.();
        }}
        value={field.state.value}
      >
        <SelectTrigger id={field.name} className="w-full">
          <SelectValue placeholder={placeholder}>{selectedOption?.label ?? null}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
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
