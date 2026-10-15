import type React from 'react';

import {
  SearchableCombobox,
  type SearchableComboboxCreate,
  type SearchableComboboxOption,
} from '@/components/common/SearchableCombobox.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

export type ComboboxFieldProps = {
  create?: SearchableComboboxCreate | undefined;
  disabled?: boolean;
  emptyMessage?: string;
  label: React.ReactNode;
  onValueCommit?: (value: string) => void;
  onValueSelect?: (value: string) => boolean | undefined;
  options: readonly SearchableComboboxOption[];
  placeholder?: string;
  resolveInputOnEnter?: (inputValue: string) => string | undefined;
  /** Rendered beside the combobox, such as a link to the selected record. */
  trailing?: React.ReactNode;
};

export function ComboboxField({
  create,
  disabled = false,
  emptyMessage,
  label,
  onValueCommit,
  onValueSelect,
  options,
  placeholder,
  resolveInputOnEnter,
  trailing,
}: ComboboxFieldProps) {
  const field = useFieldContext<string>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  const combobox = (
    <SearchableCombobox
      aria-invalid={isInvalid}
      create={create}
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
      resolveInputOnEnter={resolveInputOnEnter}
      value={field.state.value}
    />
  );

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      {trailing ? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">{combobox}</div>
          {trailing}
        </div>
      ) : (
        combobox
      )}
      <FieldError errors={fieldErrors} />
    </Field>
  );
}
