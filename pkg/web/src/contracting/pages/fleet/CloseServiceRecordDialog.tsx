import { getPlantDateNow } from '@pkg/domain';
import { suggestedNextServiceDue } from '@pkg/domain/contracting';
import type { Machine, ServiceRecord } from '@pkg/schema/contracting';
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
import { CloseServiceValues, closeServiceInput } from './types.js';

/**
 * Closing a service prints the sticker: the Next Service Due is required, and the interval only suggests it. The
 * parent mounts it for the one record being closed, keyed by that record, so it opens on a fresh form.
 */
export function CloseServiceRecordDialog({
  machine,
  record,
  mechanicOptions,
  onClose,
}: {
  machine: Pick<Machine, 'code' | 'categoryIcon' | 'categoryColour' | 'serviceIntervalHours'>;
  record: ServiceRecord;
  mechanicOptions: readonly SearchableComboboxOption[];
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const write = useContractingWrite(useQueryInvalidation().invalidateServices);
  const close = useMutation(trpc.contractingServices.close.mutationOptions(write.dialog));
  const dueEdited = useRef(false);
  const defaultValues: CloseServiceValues = {
    endDate: getPlantDateNow(),
    readingAtServiceHours: Number.NaN,
    primaryMechanicUserId: record.primaryMechanicUserId ?? '',
    notes: record.notes ?? '',
    nextServiceDueHours: Number.NaN,
  };
  return (
    <CreateEntityDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        <MachineDialogTitle
          machine={{
            machineCode: machine.code,
            categoryIcon: machine.categoryIcon,
            categoryColour: machine.categoryColour,
          }}
        >
          Close service
        </MachineDialogTitle>
      }
      description="Record what was done and set the Next Service Due you print on the sticker."
      submitLabel="Close service"
      defaultValues={defaultValues}
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
                  const suggested = Number.isNaN(value)
                    ? null
                    : suggestedNextServiceDue(value, machine.serviceIntervalHours);
                  form.setFieldValue('nextServiceDueHours', suggested ?? Number.NaN, { dontRunListeners: true });
                },
              }}
            >
              {(field) => <field.NumberField label="Reading at service (hours)" decimals={2} min={0} />}
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
                label="Next service due (hours)"
                description={
                  machine.serviceIntervalHours === null
                    ? 'The hour reading printed on the sticker.'
                    : 'The hour reading printed on the sticker. Suggested from the service interval; change it if the sticker says otherwise.'
                }
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
