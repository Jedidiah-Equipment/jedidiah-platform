import { getPlantDateNow } from '@pkg/domain';
import { useMutation } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { mechanicFieldOptions } from '@/contracting/components/MechanicCombobox.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { OpenServiceValues, openServiceFields } from './types.js';

/**
 * Books one Machine in; mounted while it is being booked, so closing unmounts it. The Machine page's Service card and
 * the Services page's pinned rows both open it.
 */
export function RecordServiceDialog({
  machineId,
  mechanicOptions,
  onClose,
}: {
  machineId: string;
  mechanicOptions: readonly SearchableComboboxOption[];
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const write = useContractingWrite(useQueryInvalidation().invalidateServices);
  const record = useMutation(trpc.contractingServices.open.mutationOptions(write.dialog));
  const defaultValues: OpenServiceValues = { startDate: getPlantDateNow(), primaryMechanicUserId: '', notes: '' };
  return (
    <CreateEntityDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Record a service"
      description="Book the Machine in. Close the service when it leaves the workshop."
      submitLabel="Record service"
      defaultValues={defaultValues}
      validator={OpenServiceValues}
      onCreate={(values) => record.mutateAsync({ machineId, ...openServiceFields(values) })}
      onCreated={onClose}
    >
      {(form) => (
        <>
          <form.AppField name="startDate">{(field) => <field.DatePickerField label="Start date" />}</form.AppField>
          <form.AppField name="primaryMechanicUserId">
            {(field) => (
              <field.ComboboxField
                label="Mechanic"
                placeholder="Search mechanics..."
                emptyMessage="No mechanics found."
                options={mechanicFieldOptions(mechanicOptions)}
              />
            )}
          </form.AppField>
          <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" />}</form.AppField>
          <ErrorMessage error={record.error} fallbackMessage="Unable to record the service." />
        </>
      )}
    </CreateEntityDialog>
  );
}
