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
