import { IconPlus } from '@tabler/icons-react';
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

/**
 * Lets a typed name that no option holds become a trailing "Create" item. Picking it calls `onCreate`,
 * and the value it returns is selected; returning nothing leaves the field as it was.
 */
export type SearchableComboboxCreate = {
  /** The stored key two names are compared by; defaults to a case-insensitive comparison. */
  lookupKey?: ((name: string) => string) | undefined;
  onCreate: (name: string) => Promise<string | undefined>;
  /** The name the typed text would be stored as, or nothing when it is not one; defaults to a trim. */
  toName?: ((inputValue: string) => string | undefined) | undefined;
};

/** The value of the trailing "Create" item; never an option's value. */
export const SEARCHABLE_COMBOBOX_CREATE_VALUE = '__searchable_combobox_create__';

type SearchableComboboxProps = {
  'aria-invalid'?: boolean | undefined;
  create?: SearchableComboboxCreate | undefined;
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
  create,
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
  const [inputValue, setInputValue] = useState('');
  const [creating, setCreating] = useState(false);
  const createItem = create ? creatableItem({ create, inputValue, options, selectedOption }) : undefined;
  const items = createItem ? [...options, createItem] : options;
  const isDisabled = disabled || creating;

  const createAndSelect = async (name: string) => {
    if (!create) return;

    setCreating(true);
    try {
      const created = await create.onCreate(name);
      if (created !== undefined) onValueChange(created);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Combobox
      disabled={isDisabled}
      isItemEqualToValue={(option, selected) => option.value === selected.value}
      items={items}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      onInputValueChange={setInputValue}
      onItemHighlighted={(_option, details) => {
        hasKeyboardHighlight.current = details.reason === 'keyboard';
      }}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) hasKeyboardHighlight.current = false;
      }}
      onValueChange={(nextOption) => {
        if (nextOption?.value === SEARCHABLE_COMBOBOX_CREATE_VALUE) {
          void createAndSelect(nextOption.label);
          return;
        }

        onValueChange(nextOption?.value ?? '');
      }}
      open={open}
      value={selectedOption}
    >
      <ComboboxInput
        aria-invalid={ariaInvalid}
        className="w-full"
        disabled={isDisabled}
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
              {option.value === SEARCHABLE_COMBOBOX_CREATE_VALUE ? (
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
  );
}

/** The trailing "Create" item for a typed name no option already holds, or nothing when there is none to offer. */
export function creatableItem({
  create,
  inputValue,
  options,
  selectedOption,
}: {
  create: Pick<SearchableComboboxCreate, 'lookupKey' | 'toName'>;
  inputValue: string;
  options: readonly SearchableComboboxOption[];
  selectedOption: SearchableComboboxOption | null;
}): SearchableComboboxOption | undefined {
  const toName = create.toName ?? ((text: string) => text.trim() || undefined);
  const lookupKey = create.lookupKey ?? ((name: string) => name.toLowerCase());
  const name = toName(inputValue);
  if (name === undefined || name === selectedOption?.label) return undefined;

  const key = lookupKey(name);
  if (options.some((option) => lookupKey(option.label) === key)) return undefined;

  return { label: name, value: SEARCHABLE_COMBOBOX_CREATE_VALUE };
}
