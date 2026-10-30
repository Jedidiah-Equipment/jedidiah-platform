import { getPlantDateNow } from '@pkg/domain';
import {
  nextServiceDueHint,
  type ServiceCloseMachine,
  suggestedNextServiceDueValue,
  suggestedServiceCloseHours,
} from '@pkg/domain/contracting';
import {
  CloseServiceValues,
  closeServiceDefaults,
  closeServiceInput,
  type ServiceRecord,
} from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { mechanicFieldOptions } from '@/contracting/components/MechanicCombobox.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * Closing a service prints the sticker: the reading starts at the Machine's Known Hours, the Next Service Due is
 * required, and the Machine's interval only suggests it.
 * The parent mounts it for the one record being closed, keyed by that record, so it opens on a fresh form.
 */
export function CloseServiceRecordDialog({
  record,
  machine,
  mechanicOptions,
  onClose,
}: {
  record: ServiceRecord;
  machine: ServiceCloseMachine;
  mechanicOptions: readonly SearchableComboboxOption[];
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const write = useContractingWrite(useQueryInvalidation().invalidateServices);
  const close = useMutation(trpc.contractingServices.close.mutationOptions(write.dialog));
  const dueEdited = useRef(false);
  const { serviceIntervalHours } = machine;
  return (
    <CreateEntityDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={<MachineDialogTitle machine={record}>Close service</MachineDialogTitle>}
      description="Record what was done and set the Next Service Due you print on the sticker."
      submitLabel="Close service"
      defaultValues={closeServiceDefaults(record, getPlantDateNow(), suggestedServiceCloseHours(machine))}
      validator={CloseServiceValues}
      onCreate={(values) => close.mutateAsync(closeServiceInput(record.id, values))}
      onCreated={() => {
        toast.success('Service recorded');
        onClose();
      }}
    >
      {(form) => (
        <>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <form.AppField name="endDate">{(field) => <field.DatePickerField label="End date" />}</form.AppField>
            <form.AppField
              name="readingAtServiceHours"
              listeners={{
                onChange: ({ value }) => {
                  if (dueEdited.current) return;
                  form.setFieldValue('nextServiceDueHours', suggestedNextServiceDueValue(value, serviceIntervalHours), {
                    dontRunListeners: true,
                  });
                },
              }}
            >
              {(field) => <field.NumberField label="Reading at service" decimals={2} min={0} unit="hours" />}
            </form.AppField>
          </div>
          <form.AppField name="primaryMechanicUserId">
            {(field) => (
              <field.ComboboxField
                label="Mechanic"
                placeholder="Search mechanics..."
                emptyMessage="No mechanics found."
                options={mechanicFieldOptions(mechanicOptions, record)}
              />
            )}
          </form.AppField>
          <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" />}</form.AppField>
          <form.AppField
            name="nextServiceDueHours"
            listeners={{
              onChange: () => {
                dueEdited.current = true;
              },
            }}
          >
            {(field) => (
              <field.NumberField
                label="Next service due"
                unit="hours"
                description={nextServiceDueHint(serviceIntervalHours)}
                decimals={2}
                min={0}
              />
            )}
          </form.AppField>
          <ErrorMessage error={close.error} fallbackMessage="Unable to close the service." />
        </>
      )}
    </CreateEntityDialog>
  );
}
