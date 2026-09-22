import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';

/** The value of the trailing "create" item; never a Part Category id. */
export const CREATE_PART_CATEGORY_VALUE = '__create_part_category__';

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
  const name = inputValue.trim().replaceAll(/\s+/g, ' ');
  const isNovel =
    name !== '' &&
    name !== selectedLabel &&
    !options.some((option) => option.label.toLowerCase() === name.toLowerCase());

  return canCreate && isNovel ? [...options, { label: name, value: CREATE_PART_CATEGORY_VALUE }] : [...options];
}
