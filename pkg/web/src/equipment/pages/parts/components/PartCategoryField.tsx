import { IconPlus } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';

import { ComboboxField } from '@/components/form/fields/ComboboxField.js';
import { useFieldContext } from '@/components/form/hooks/form-context.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { usePartCategoryOptions } from '@/equipment/hooks/options/index.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

const LABEL = 'Part Category';
const CREATE_VALUE = '__create_part_category__';

/**
 * The picker's items. A typed name that no Part Category already has, ignoring casing, becomes a
 * trailing "create" item — but only for people who may create one; everyone else picks from the list.
 */
export function partCategoryPickerItems({
  canCreate,
  inputValue,
  options,
  selectedLabel,
}: {
  canCreate: boolean;
  inputValue: string;
  options: readonly SearchableComboboxOption[];
  selectedLabel: string | undefined;
}): SearchableComboboxOption[] {
  const name = inputValue.trim();
  const isNovel =
    name !== '' &&
    name !== selectedLabel &&
    !options.some((option) => option.label.toLowerCase() === name.toLowerCase());

  return canCreate && isNovel ? [...options, { label: name, value: CREATE_VALUE }] : [...options];
}

/** A Part's Part Category picker; render inside `<form.AppField name="categoryId">`. */
export function PartCategoryField() {
  const categories = usePartCategoryOptions();
  const canCreate = useCan('equipment_part_category:update').can;
  const placeholder = categories.isPending ? 'Loading Part Categories...' : 'Search Part Categories';

  if (!canCreate) {
    return (
      <ComboboxField
        disabled={categories.isPending}
        emptyMessage="No Part Categories found."
        label={LABEL}
        options={categories.selectOptions}
        placeholder={placeholder}
      />
    );
  }

  return (
    <CreatablePartCategoryCombobox
      disabled={categories.isPending}
      options={categories.selectOptions}
      placeholder={`${placeholder} or type a new one`}
    />
  );
}

function CreatablePartCategoryCombobox({
  disabled,
  options,
  placeholder,
}: {
  disabled: boolean;
  options: readonly SearchableComboboxOption[];
  placeholder: string;
}) {
  const field = useFieldContext<string>();
  const trpc = useTRPC();
  const { invalidatePartCategories } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const create = useMutation(
    trpc.partCategories.create.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to create Part Category.'),
    }),
  );
  const [inputValue, setInputValue] = useState('');
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;
  const selected = options.find((option) => option.value === field.state.value) ?? null;
  const items = partCategoryPickerItems({ canCreate: true, inputValue, options, selectedLabel: selected?.label });

  const createAndSelect = async (name: string) => {
    const category = await create.mutateAsync({ name }).catch(() => undefined);
    if (!category) return;

    // The new option has to be in the list before the field points at it, or the input shows blank.
    await invalidatePartCategories();
    field.handleChange(category.id);
  };

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{LABEL}</FieldLabel>
      <Combobox
        disabled={disabled || create.isPending}
        isItemEqualToValue={(option, value) => option.value === value.value}
        items={items}
        itemToStringLabel={(option) => option.label}
        itemToStringValue={(option) => option.value}
        onInputValueChange={setInputValue}
        onValueChange={(option) => {
          if (option?.value === CREATE_VALUE) {
            void createAndSelect(option.label);
            return;
          }

          field.handleChange(option?.value ?? '');
        }}
        value={selected}
      >
        <ComboboxInput
          aria-invalid={isInvalid}
          className="w-full"
          disabled={disabled || create.isPending}
          id={field.name}
          onBlur={field.handleBlur}
          placeholder={placeholder}
          showClear
        />
        <ComboboxContent>
          <ComboboxEmpty>No Part Categories found.</ComboboxEmpty>
          <ComboboxList>
            {(option: SearchableComboboxOption) => (
              <ComboboxItem key={option.value} value={option}>
                {option.value === CREATE_VALUE ? (
                  <>
                    <IconPlus data-icon="inline-start" />
                    Create "{option.label}"
                  </>
                ) : (
                  option.label
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldError errors={fieldErrors} />
    </Field>
  );
}
