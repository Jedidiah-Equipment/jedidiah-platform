import { useRef } from 'react';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';

export type SearchableComboboxOption = {
  /** Optional machine-entered token that commits this option only on an exact match. */
  exactInputValue?: string;
  label: string;
  value: string;
};

type SearchableComboboxProps = {
  'aria-invalid'?: boolean | undefined;
  disabled?: boolean;
  emptyMessage?: string | undefined;
  inputId: string;
  onBlur?: (() => void) | undefined;
  onValueChange: (value: string) => void;
  options: readonly SearchableComboboxOption[];
  placeholder?: string | undefined;
  value: string;
};

export function SearchableCombobox({
  'aria-invalid': ariaInvalid,
  disabled = false,
  emptyMessage = 'No options found.',
  inputId,
  onBlur,
  onValueChange,
  options,
  placeholder = 'Search...',
  value,
}: SearchableComboboxProps) {
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const keyboardSelectionPending = useRef(false);

  return (
    <Combobox
      disabled={disabled}
      isItemEqualToValue={(option, selected) => option.value === selected.value}
      items={options}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      onValueChange={(nextOption) => onValueChange(nextOption?.value ?? '')}
      value={selectedOption}
    >
      <ComboboxInput
        aria-invalid={ariaInvalid}
        className="w-full"
        disabled={disabled}
        id={inputId}
        onBlur={onBlur}
        onKeyDownCapture={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            keyboardSelectionPending.current = true;
            return;
          }

          if (event.key !== 'Enter') {
            keyboardSelectionPending.current = false;
            return;
          }

          if (keyboardSelectionPending.current) {
            keyboardSelectionPending.current = false;
            return;
          }

          const exactInputOptions = options.filter((option) => option.exactInputValue !== undefined);
          if (exactInputOptions.length === 0) return;

          if (event.currentTarget.value === selectedOption?.label) return;

          event.preventDefault();
          event.stopPropagation();
          const match = exactInputOptions.find((option) => option.exactInputValue === event.currentTarget.value.trim());
          if (!match) return;

          onValueChange(match.value);
        }}
        placeholder={placeholder}
        showClear
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(option: SearchableComboboxOption) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
