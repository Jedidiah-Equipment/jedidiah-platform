import { type Machine, OpenServiceValues, openServiceFields, type ServiceRecord } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { AutosaveFormFields } from '@/components/form/AutosaveFormCard.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth } from '@/components/page-layout/EditFormLayout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { mechanicFieldOptions } from '@/contracting/components/MechanicCombobox.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { CloseServiceRecordDialog } from '@/contracting/pages/fleet/CloseServiceRecordDialog.js';
import { useServiceMechanicOptions } from '@/contracting/pages/fleet/use-service-mechanic-options.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * A service still in the workshop: its start date, Mechanic and notes autosave until it is closed. `machine` is
 * undefined until the fleet read resolves, and closing waits for it because the dialog suggests from its interval.
 */
export function OpenServiceForm({ record, machine }: { record: ServiceRecord; machine: Machine | undefined }) {
  const trpc = useTRPC();
  const canUpdate = useCan('contracting_service:update').can;
  const mechanics = useServiceMechanicOptions(canUpdate);
  const showError = useApiMutationErrorToast();
  const write = useContractingWrite(useQueryInvalidation().invalidateServices);
  const patch = useMutation(trpc.contractingServices.patch.mutationOptions({ onSuccess: write.invalidate }));
  const [closing, setClosing] = useState(false);
  const defaultValues: OpenServiceValues = {
    startDate: record.startDate,
    primaryMechanicUserId: record.primaryMechanicUserId ?? '',
    notes: record.notes ?? '',
  };
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues,
    failureMessage: 'Unable to update the service.',
    validator: OpenServiceValues,
    toInput: (values) => ({ id: record.id, ...openServiceFields(values) }),
    save: (input) => patch.mutateAsync(input),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Service</CardTitle>
        <CardAction className="flex items-center gap-2">
          <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
          {canUpdate ? (
            <Button
              disabled={!machine}
              title={machine ? undefined : 'Loading the Machine…'}
              onClick={async () => {
                // The close dialog starts from the saved record, so a note typed a moment ago lands first.
                if (await autosave.flush()) setClosing(true);
                else showError(new Error('Resolve unsaved changes before closing the service.'), 'Unable to close.');
              }}
            >
              Close service
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorMessage error={mechanics.error} fallbackMessage="Unable to load mechanics." />
        <AutosaveFormFields formProps={formProps} disabled={!canUpdate}>
          <form.AppField name="startDate">
            {(field) => <field.DatePickerField label="Start date" onValueCommit={autosave.commit} />}
          </form.AppField>
          <form.AppField name="primaryMechanicUserId">
            {(field) => (
              <field.ComboboxField
                label="Mechanic"
                placeholder="Search mechanics..."
                emptyMessage="No mechanics found."
                options={mechanicFieldOptions(mechanics.options, record)}
                onValueCommit={autosave.commit}
              />
            )}
          </form.AppField>
          <EditFormFullWidth>
            <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" />}</form.AppField>
          </EditFormFullWidth>
        </AutosaveFormFields>
      </CardContent>
      {closing && machine ? (
        <CloseServiceRecordDialog
          key={record.id}
          machine={machine}
          record={record}
          mechanicOptions={mechanics.options}
          onClose={() => setClosing(false)}
        />
      ) : null}
    </Card>
  );
}
