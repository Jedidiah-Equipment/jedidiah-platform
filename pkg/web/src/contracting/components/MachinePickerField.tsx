import type { Machine } from '@pkg/schema/contracting';
import { useMemo } from 'react';
import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { ComboboxField } from '@/components/form/fields/ComboboxField.js';
import { CategoryIcon } from './CategoryIcon.js';

type PickableMachine = Pick<Machine, 'id' | 'code' | 'make' | 'model' | 'categoryIcon' | 'categoryColour'>;

/** A Machine as every Machine pick list shows it: its Category icon, then code · make model, then any note. */
const machinePickOption = (machine: PickableMachine, note?: string | null): SearchableComboboxOption => ({
  value: machine.id,
  icon: <CategoryIcon icon={machine.categoryIcon} colour={machine.categoryColour} size={14} />,
  label: `${machine.code} · ${machine.make} ${machine.model}${note ? ` · ${note}` : ''}`,
});

/** The Machine pick field; render it inside a `form.AppField` whose value is the Machine id. */
export function MachinePickerField<TMachine extends PickableMachine>({
  machines,
  note,
  emptyMessage = 'No machines found.',
}: {
  machines: readonly TMachine[];
  /** Said after the Machine's name, such as the Job it is on. */
  note?: (machine: TMachine) => string | null;
  emptyMessage?: string;
}) {
  const options = useMemo(
    () => machines.map((machine) => machinePickOption(machine, note?.(machine))),
    [machines, note],
  );
  return (
    <ComboboxField label="Machine" placeholder="Search machines..." emptyMessage={emptyMessage} options={options} />
  );
}
