import type * as React from 'react';

import { DatePicker } from '@/components/common/DatePicker.js';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

export type DatePickerFieldProps = {
  clearable?: boolean;
  description?: React.ReactNode;
  disabled?: boolean;
  label: React.ReactNode;
  maxValue?: string;
  minValue?: string;
  onValueCommit?: () => void;
  placeholder?: string;
};

export function DatePickerField({
  clearable = false,
  description,
  disabled = false,
  label,
  maxValue,
  minValue,
  onValueCommit,
  placeholder,
}: DatePickerFieldProps) {
  const field = useFieldContext<string>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  return (
    <Field data-disabled={disabled} data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <DatePicker
        aria-invalid={isInvalid}
        clearable={clearable}
        disabled={disabled}
        id={field.name}
        {...(maxValue ? { maxValue } : {})}
        {...(minValue ? { minValue } : {})}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(value) => {
          field.handleChange(value);
          onValueCommit?.();
        }}
        value={field.state.value}
        {...(placeholder ? { placeholder } : {})}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={fieldErrors} />
    </Field>
  );
}
