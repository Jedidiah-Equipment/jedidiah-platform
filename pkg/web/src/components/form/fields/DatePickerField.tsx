import type * as React from 'react';

import { DatePicker } from '@/components/common/DatePicker.js';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

export type DatePickerFieldProps = {
  description?: React.ReactNode;
  disabled?: boolean;
  fieldClassName?: string;
  isDateDisabled?: (date: Date) => boolean;
  label: React.ReactNode;
  maxValue?: string;
  minValue?: string;
  onValueCommit?: () => void;
  orientation?: React.ComponentProps<typeof Field>['orientation'];
  placeholder?: string;
};

export function DatePickerField({
  description,
  disabled = false,
  fieldClassName,
  isDateDisabled,
  label,
  maxValue,
  minValue,
  onValueCommit,
  orientation,
  placeholder,
}: DatePickerFieldProps) {
  const field = useFieldContext<string>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  return (
    <Field className={fieldClassName} data-disabled={disabled} data-invalid={isInvalid} orientation={orientation}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <DatePicker
        aria-invalid={isInvalid}
        disabled={disabled}
        id={field.name}
        {...(isDateDisabled ? { isDateDisabled } : {})}
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
