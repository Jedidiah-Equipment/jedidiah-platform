import type React from 'react';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';

type EntityComboboxProps<TOption extends { id: string }> = {
  disabled: boolean;
  emptyMessage: string;
  inputId: string;
  inputValue: string;
  isFetching: boolean;
  itemToLabel: (option: TOption) => string;
  onInputValueChange: (value: string) => void;
  onSelected: (option: TOption | null) => void;
  options: TOption[];
  placeholder: string;
  renderItem: (option: TOption) => React.ReactNode;
  searchPlaceholder: string;
  value: TOption | null;
};

const getEntityOptionId = <TOption extends { id: string }>(option: TOption) => option.id;

export function EntityCombobox<TOption extends { id: string }>({
  disabled,
  emptyMessage,
  inputId,
  inputValue,
  isFetching,
  itemToLabel,
  onInputValueChange,
  onSelected,
  options,
  placeholder,
  renderItem,
  searchPlaceholder,
  value,
}: EntityComboboxProps<TOption>) {
  const selectedLabel = value ? itemToLabel(value) : '';
  const displayInputValue = inputValue || selectedLabel;

  return (
    <Combobox
      disabled={disabled}
      filter={null}
      inputValue={displayInputValue}
      itemToStringLabel={itemToLabel}
      itemToStringValue={getEntityOptionId}
      items={options}
      onInputValueChange={(nextInputValue, eventDetails) => {
        if (eventDetails.reason === 'item-press' || nextInputValue === displayInputValue) {
          return;
        }

        onInputValueChange(nextInputValue);
      }}
      onValueChange={(nextOption) => {
        if ((nextOption?.id ?? null) === (value?.id ?? null)) {
          return;
        }

        onSelected(nextOption);
      }}
      value={value}
    >
      <ComboboxInput
        className="w-full"
        disabled={disabled}
        id={inputId}
        placeholder={isFetching ? searchPlaceholder : placeholder}
        showClear
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(option: TOption) => (
            <ComboboxItem key={option.id} value={option}>
              {renderItem(option)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function mergeSelectedOption<TOption extends { id: string }>(
  options: readonly TOption[],
  selected: TOption | null | undefined,
): TOption[] {
  if (!selected || options.some((option) => option.id === selected.id)) {
    return [...options];
  }

  return [...options, selected];
}
