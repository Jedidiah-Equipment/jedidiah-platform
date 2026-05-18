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
  return (
    <Combobox
      disabled={disabled}
      filter={null}
      inputValue={inputValue}
      itemToStringLabel={itemToLabel}
      items={options}
      onInputValueChange={onInputValueChange}
      onValueChange={onSelected}
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
