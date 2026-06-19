import { IconPlus } from '@tabler/icons-react';
import { useMemo } from 'react';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

export type CreatableComboboxFieldProps = {
  // When false, a novel typed value is accepted as-is but never offered as a "Use X" row; the input
  // simply keeps what was typed. Defaults to true (the create affordance is shown).
  creatable?: boolean;
  description?: React.ReactNode;
  disabled?: boolean;
  emptyMessage?: string;
  label: React.ReactNode;
  options: readonly string[];
  placeholder?: string;
};

export function CreatableComboboxField({
  creatable = true,
  description,
  disabled = false,
  emptyMessage = 'No options found.',
  label,
  options,
  placeholder,
}: CreatableComboboxFieldProps) {
  const field = useFieldContext<string>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;
  const trimmedValue = field.state.value.trim();
  const normalizedOptions = useMemo(() => createNormalizedOptions(options), [options]);
  const hasExactOption = normalizedOptions.some((option) => option.toLowerCase() === trimmedValue.toLowerCase());
  const showCreateOption = creatable && Boolean(trimmedValue) && !hasExactOption;
  const items = showCreateOption ? [...normalizedOptions, trimmedValue] : normalizedOptions;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Combobox
        disabled={disabled}
        inputValue={field.state.value}
        items={items}
        onInputValueChange={(nextInputValue) => field.handleChange(nextInputValue)}
        onValueChange={(nextValue) => field.handleChange(nextValue ?? '')}
        value={trimmedValue || null}
      >
        <ComboboxInput
          aria-invalid={isInvalid}
          className="w-full"
          disabled={disabled}
          id={field.name}
          onBlur={field.handleBlur}
          placeholder={placeholder}
          showClear
        />
        <ComboboxContent>
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
          <ComboboxList>
            {(option: string) => (
              <ComboboxItem key={option} value={option}>
                {showCreateOption && option === trimmedValue ? (
                  <>
                    <IconPlus data-icon="inline-start" />
                    Use "{option}"
                  </>
                ) : (
                  option
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={fieldErrors} />
    </Field>
  );
}

function createNormalizedOptions(options: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalizedOptions: string[] = [];

  for (const option of options) {
    const normalized = option.trim();
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedOptions.push(normalized);
  }

  return normalizedOptions.sort((left, right) => left.localeCompare(right));
}
