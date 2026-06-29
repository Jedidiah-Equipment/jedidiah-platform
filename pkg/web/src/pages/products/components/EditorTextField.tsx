import type React from 'react';

import type { FieldApi } from '@/components/form/types.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';

type EditorTextFieldProps = {
  field: FieldApi<string>;
  // Doubles as the screen-reader label and the aria-label, since these inline editor rows have no visible label.
  label: string;
  placeholder: string;
  className?: string;
};

// A single labelled text input wired to a TanStack `Field` render-prop value, with the row's validation errors
// surfaced inline. Shared by the freeform list editors (key features, technical details) whose array rows are
// plain text inputs rather than the higher-level `AppField` components.
export const EditorTextField: React.FC<EditorTextFieldProps> = ({ field, label, placeholder, className }) => {
  const errors = getFieldErrors(field.state.meta.errors);
  const isInvalid = errors.length > 0;

  return (
    <Field className={className} data-invalid={isInvalid}>
      <FieldLabel className="sr-only">{label}</FieldLabel>
      <Input
        aria-invalid={isInvalid}
        aria-label={label}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        placeholder={placeholder}
        value={field.state.value}
      />
      <FieldError errors={errors} />
    </Field>
  );
};
