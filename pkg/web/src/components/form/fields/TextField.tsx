import type * as React from 'react';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

type TextFieldInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'aria-invalid' | 'id' | 'name' | 'onBlur' | 'onChange' | 'type' | 'value'
>;

export type TextFieldProps = {
  description?: React.ReactNode;
  label: React.ReactNode;
  type?: React.HTMLInputTypeAttribute;
} & TextFieldInputProps;

export function TextField({ description, label, type = 'text', ...inputProps }: TextFieldProps) {
  const field = useFieldContext<string>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        aria-invalid={isInvalid}
        id={field.name}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        type={type}
        value={field.state.value}
        {...inputProps}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={fieldErrors} />
    </Field>
  );
}
