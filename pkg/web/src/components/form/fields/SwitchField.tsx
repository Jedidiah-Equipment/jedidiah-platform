import type * as React from 'react';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Switch } from '@/components/ui/switch.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

type SwitchFieldInputProps = Omit<
  React.ComponentProps<typeof Switch>,
  'aria-invalid' | 'checked' | 'id' | 'name' | 'onBlur' | 'onCheckedChange'
>;

export type SwitchFieldProps = {
  description?: React.ReactNode;
  label: React.ReactNode;
  onValueCommit?: () => void;
} & SwitchFieldInputProps;

// A boolean toggle laid out vertically like the text fields: label on its own line, the switch on the next.
// The switch is wrapped so the Field's `*:w-full` rule sizes the wrapper, not the pill, keeping it left-aligned.
export function SwitchField({ description, label, onValueCommit, ...inputProps }: SwitchFieldProps) {
  const field = useFieldContext<boolean>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <div>
        <Switch
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
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={fieldErrors} />
    </Field>
  );
}
