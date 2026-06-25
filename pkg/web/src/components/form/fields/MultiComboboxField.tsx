import type * as React from 'react';

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from '@/components/ui/combobox.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

export type MultiComboboxFieldOption = {
  label: string;
  value: string;
};

export type MultiComboboxFieldProps = {
  disabled?: boolean;
  emptyMessage?: string;
  label: React.ReactNode;
  options: readonly MultiComboboxFieldOption[];
  placeholder?: string;
};

export function MultiComboboxField({
  disabled = false,
  emptyMessage = 'No options found.',
  label,
  options,
  placeholder = 'Select…',
}: MultiComboboxFieldProps) {
  const field = useFieldContext<string[]>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;
  const optionLabels = new Map(options.map((option) => [option.value, option.label]));
  const selectedValues = field.state.value ?? [];

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Combobox
        disabled={disabled}
        items={options.map((option) => option.value)}
        itemToStringValue={(value) => optionLabels.get(value) ?? value}
        multiple
        onValueChange={(nextValues) => field.handleChange(nextValues)}
        value={selectedValues}
      >
        <ComboboxChips aria-invalid={isInvalid}>
          <ComboboxValue>
            {selectedValues.map((value) => (
              <ComboboxChip key={value}>{optionLabels.get(value) ?? value}</ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput disabled={disabled} id={field.name} placeholder={placeholder} />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
          <ComboboxList>
            {(value: string) => (
              <ComboboxItem key={value} value={value}>
                {optionLabels.get(value) ?? value}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldError errors={fieldErrors} />
    </Field>
  );
}
