import { useRef, useState } from 'react';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';

export type SearchableComboboxOption = {
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
  resolveInputOnEnter?: ((inputValue: string) => string | undefined) | undefined;
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
  resolveInputOnEnter,
  value,
}: SearchableComboboxProps) {
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const hasKeyboardHighlight = useRef(false);
  const [open, setOpen] = useState(false);

  return (
    <Combobox
      disabled={disabled}
      isItemEqualToValue={(option, selected) => option.value === selected.value}
      items={options}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      onItemHighlighted={(_option, details) => {
        hasKeyboardHighlight.current = details.reason === 'keyboard';
      }}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) hasKeyboardHighlight.current = false;
      }}
      onValueChange={(nextOption) => onValueChange(nextOption?.value ?? '')}
      open={open}
      value={selectedOption}
    >
      <ComboboxInput
        aria-invalid={ariaInvalid}
        className="w-full"
        disabled={disabled}
        id={inputId}
        onBlur={onBlur}
        onKeyDownCapture={(event) => {
          if (
            event.key !== 'Enter' ||
            !resolveInputOnEnter ||
            hasKeyboardHighlight.current ||
            event.currentTarget.value === selectedOption?.label
          )
            return;

          event.preventDefault();
          event.stopPropagation();
          const nextValue = resolveInputOnEnter(event.currentTarget.value);
          if (!nextValue) return;

          setOpen(false);
          onValueChange(nextValue);
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
