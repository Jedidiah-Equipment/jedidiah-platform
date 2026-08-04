import type React from 'react';

import { SearchableCombobox, type SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

export type ComboboxFieldProps = {
  disabled?: boolean;
  emptyMessage?: string;
  label: React.ReactNode;
  onValueCommit?: (value: string) => void;
  onValueSelect?: (value: string) => boolean | undefined;
  options: readonly SearchableComboboxOption[];
  placeholder?: string;
};

export function ComboboxField({
  disabled = false,
  emptyMessage,
  label,
  onValueCommit,
  onValueSelect,
  options,
  placeholder,
}: ComboboxFieldProps) {
  const field = useFieldContext<string>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <SearchableCombobox
        aria-invalid={isInvalid}
        disabled={disabled}
        emptyMessage={emptyMessage}
        inputId={field.name}
        onBlur={field.handleBlur}
        onValueChange={(nextValue) => {
          if (nextValue === field.state.value || onValueSelect?.(nextValue) === false) return;

          field.handleChange(nextValue);
          onValueCommit?.(nextValue);
        }}
        options={options}
        placeholder={placeholder}
        value={field.state.value}
      />
      <FieldError errors={fieldErrors} />
    </Field>
  );
}
