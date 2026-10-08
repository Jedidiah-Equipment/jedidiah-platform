import {
  SearchableCombobox,
  type SearchableComboboxOption,
  withCurrentOption,
} from '@/components/common/SearchableCombobox.js';

const NO_MECHANIC: SearchableComboboxOption = { value: '', label: 'No mechanic' };

/** The Mechanic options a form field offers: none first, then the record's own Mechanic even once the list lacks them. */
export function mechanicFieldOptions(
  options: readonly SearchableComboboxOption[],
  current?: { primaryMechanicUserId: string | null; mechanicName: string | null },
): SearchableComboboxOption[] {
  const offered = current
    ? withCurrentOption(options, current.primaryMechanicUserId, current.mechanicName ?? 'Unavailable mechanic')
    : options;
  return [NO_MECHANIC, ...offered];
}

/** Assigns a Mechanic in place; `inRow` keeps the picker from opening the table row it sits in. */
export function MechanicCombobox({
  inputId,
  options,
  value,
  onValueChange,
  inRow = false,
}: {
  inputId: string;
  options: readonly SearchableComboboxOption[];
  value: string | null;
  onValueChange: (mechanicUserId: string | null) => void;
  inRow?: boolean;
}) {
  const combobox = (
    <SearchableCombobox
      inputId={inputId}
      options={[NO_MECHANIC, ...options]}
      placeholder="Assign mechanic…"
      value={value ?? ''}
      onValueChange={(picked) => onValueChange(picked || null)}
    />
  );
  if (!inRow) return combobox;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keeps the picker from opening the row
    // biome-ignore lint/a11y/useKeyWithClickEvents: the picker owns its keyboard handling
    <div className="w-48" onClick={(event) => event.stopPropagation()}>
      {combobox}
    </div>
  );
}
