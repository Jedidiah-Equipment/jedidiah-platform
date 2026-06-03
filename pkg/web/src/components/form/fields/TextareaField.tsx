import type * as React from 'react';

import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

type TextareaFieldInputProps = Omit<
  React.ComponentProps<typeof Textarea>,
  'aria-invalid' | 'id' | 'name' | 'onBlur' | 'onChange' | 'value'
>;

export type TextareaFieldProps = {
  label?: React.ReactNode;
} & TextareaFieldInputProps;

export function TextareaField({ label, ...inputProps }: TextareaFieldProps) {
  const field = useFieldContext<string>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  return (
    <Field data-invalid={isInvalid}>
      {label ? <FieldLabel htmlFor={field.name}>{label}</FieldLabel> : null}
      <Textarea
        aria-invalid={isInvalid}
        id={field.name}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        value={field.state.value}
        {...inputProps}
      />
      <FieldError errors={fieldErrors} />
    </Field>
  );
}
