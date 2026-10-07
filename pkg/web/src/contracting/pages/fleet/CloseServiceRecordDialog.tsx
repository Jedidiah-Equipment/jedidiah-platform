import { getPlantDateNow } from '@pkg/domain';
import { suggestedNextServiceDue } from '@pkg/domain/contracting';
import type { Machine, ServiceRecord } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useResetOnOpen } from '@/contracting/pages/jobs/use-job-write.js';
import { useApiMutationErrorReport } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { CloseServiceValues, closeServiceInput } from './types.js';

/** Closing a service prints the sticker: the Next Service Due is required, and the interval only suggests it. */
export function CloseServiceRecordDialog({
  machine,
  record,
  mechanicOptions,
  onClose,
}: {
  machine: Pick<Machine, 'code' | 'categoryIcon' | 'categoryColour' | 'serviceIntervalHours'>;
  record: ServiceRecord | null;
  mechanicOptions: readonly SearchableComboboxOption[];
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { invalidateFleet, invalidateWorkshop } = useQueryInvalidation();
  const report = useApiMutationErrorReport();
  const close = useMutation(
    trpc.contractingServices.close.mutationOptions({
      onSuccess: async () => {
        await Promise.all([invalidateFleet(), invalidateWorkshop()]);
        toast.success('Service recorded');
      },
      onError: report,
    }),
  );
  useResetOnOpen(close, !!record);
  const dueEdited = useRef(false);
  const recordId = record?.id ?? null;
  useEffect(() => {
    if (recordId) dueEdited.current = false;
  }, [recordId]);
  const options = [...mechanicOptions];
  if (record?.primaryMechanicUserId && !options.some((option) => option.value === record.primaryMechanicUserId))
    options.push({ value: record.primaryMechanicUserId, label: record.mechanicName ?? 'Unavailable mechanic' });
  const defaultValues: CloseServiceValues = {
    endDate: getPlantDateNow(),
    readingAtServiceHours: Number.NaN,
    primaryMechanicUserId: record?.primaryMechanicUserId ?? '',
    notes: record?.notes ?? '',
    nextServiceDueHours: Number.NaN,
  };
  return (
    <CreateEntityDialog
      key={record?.id ?? 'closed'}
      open={!!record}
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
      onCreate={(values) => close.mutateAsync(closeServiceInput(record?.id ?? '', values))}
      onCreated={onClose}
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
                options={[{ label: 'No mechanic', value: '' }, ...options]}
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
