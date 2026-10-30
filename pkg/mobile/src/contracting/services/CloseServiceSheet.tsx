import { getPlantDateNow } from '@pkg/domain';
import { nextServiceDueHint, suggestedNextServiceDueValue } from '@pkg/domain/contracting';
import {
  CloseServiceValues,
  closeServiceDefaults,
  closeServiceInput,
  type ServiceRecord,
} from '@pkg/schema/contracting';
import { revalidateLogic } from '@tanstack/react-form';
import { useRef } from 'react';
import { useAppForm } from '@/components/form';
import { ModalSheet, SheetSubmitButton } from '@/components/ModalSheet';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useBusyAction } from '@/lib/use-busy-action';
import { useServiceMechanicOptions, useServiceMutation } from './use-services';

const CLOSE_FAILED = 'Could not close the service. Check your connection and try again.';

/**
 * Closing a service prints the sticker: the Next Service Due is required, and the interval only suggests it. Mounted
 * while open, so each open starts from today.
 */
export function CloseServiceSheet({
  record,
  serviceIntervalHours,
  onClose,
}: {
  record: ServiceRecord;
  serviceIntervalHours: number | null;
  onClose: () => void;
}) {
  const mechanicOptions = useServiceMechanicOptions(record);
  const close = useServiceMutation((services) => services.close);
  const showToast = useAppToast();
  const { busy, error, run } = useBusyAction();
  const dueEdited = useRef(false);
  const form = useAppForm({
    defaultValues: closeServiceDefaults(record, getPlantDateNow()),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: CloseServiceValues },
    onSubmit: ({ value }) =>
      run(async () => {
        await close.mutateAsync(closeServiceInput(record.id, value));
        onClose();
        showToast('success', 'Service recorded');
      }, CLOSE_FAILED),
  });
  return (
    <ModalSheet
      title="Close service"
      subtitle="Record what was done and set the Next Service Due you print on the sticker."
      error={error}
      footer={<SheetSubmitButton isSubmitting={busy} label="Close service" onPress={() => void form.handleSubmit()} />}
      // Held open until the close and its refetch settle, so the screen it returns to already reads closed.
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form.AppField name="endDate">{(field) => <field.DateField label="End date" />}</form.AppField>
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
        {(field) => <field.NumberField label="Reading at service (hours)" />}
      </form.AppField>
      <form.AppField name="primaryMechanicUserId">
        {(field) => (
          <field.SearchSelectField
            label="Mechanic"
            placeholder="No Mechanic yet"
            searchPlaceholder="Search mechanics…"
            emptyMessage="No mechanics match."
            options={mechanicOptions}
          />
        )}
      </form.AppField>
      <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" rows={4} />}</form.AppField>
      <form.AppField
        name="nextServiceDueHours"
        listeners={{
          onChange: () => {
            dueEdited.current = true;
          },
        }}
      >
        {(field) => <field.NumberField label="Next service due (hours)" />}
      </form.AppField>
      <Text className="-mt-2 text-xs text-muted-foreground">{nextServiceDueHint(serviceIntervalHours)}</Text>
    </ModalSheet>
  );
}
