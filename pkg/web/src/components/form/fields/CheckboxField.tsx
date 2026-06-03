import type * as React from 'react';

import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

type CheckboxFieldInputProps = Omit<
  React.ComponentProps<typeof Checkbox>,
  'aria-invalid' | 'checked' | 'id' | 'name' | 'onBlur' | 'onCheckedChange'
>;

export type CheckboxFieldProps = {
  description?: React.ReactNode;
  label: React.ReactNode;
  onValueCommit?: () => void;
} & CheckboxFieldInputProps;

export function CheckboxField({ description, label, onValueCommit, ...inputProps }: CheckboxFieldProps) {
  const field = useFieldContext<boolean>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  return (
    <Field data-invalid={isInvalid} orientation="horizontal">
      <Checkbox
        aria-invalid={isInvalid}
        checked={field.state.value}
        id={field.name}
        name={field.name}
        onBlur={field.handleBlur}
        onCheckedChange={(checked) => {
          field.handleChange(checked === true);
          onValueCommit?.();
        }}
        {...inputProps}
      />
      <FieldContent>
        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        <FieldError errors={fieldErrors} />
      </FieldContent>
    </Field>
  );
}
