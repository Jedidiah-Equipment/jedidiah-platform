import { formatDate, formatHours } from '@pkg/domain';
import { hoursToServiceLabel, machineServiceBadge } from '@pkg/domain/contracting';
import type { Machine, ServiceRecord } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { HelpLink } from '@/components/help/index.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { mechanicFieldOptions } from '@/contracting/components/MechanicCombobox.js';
import { ServiceBadge } from '@/contracting/components/ServiceBadge.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { CloseServiceRecordDialog } from './CloseServiceRecordDialog.js';
import { RecordServiceDialog } from './RecordServiceDialog.js';
import { SpotCaptureDialog } from './SpotCaptureDialog.js';
import { OpenServiceValues, openServiceFields } from './types.js';
import { useServiceMechanicOptions } from './use-service-mechanic-options.js';

const hoursOrDash = (hours: number | null) => (hours === null ? '—' : formatHours(hours));

/** Where the Machine stands on service, and the services still in the workshop; the History card lists the past ones. */
export function MachineServiceCard({ machine }: { machine: Machine }) {
  const trpc = useTRPC();
  const readsServices = useCan('contracting_service:read').can;
  const canRecord = useCan('contracting_service:update').can && !machine.retiredAt;
  const canCapture = useCan('contracting_reading:capture').can && !machine.retiredAt;
  const records = useQuery(
    trpc.contractingServices.list.queryOptions({ machineId: machine.id }, { enabled: readsServices && canRecord }),
  );
  const mechanics = useServiceMechanicOptions(canRecord);
  const mechanicOptions = mechanics.options;
  const [opening, setOpening] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const openRecords = (records.data ?? []).filter((record) => record.status === 'open');
  const closing = openRecords.find((record) => record.id === closingId);
  if (!readsServices) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Service</CardTitle>
        <CardAction>
          <HelpLink label="How to record a service" topic="contractingMachineService" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <ServiceBadge {...machineServiceBadge(machine)} />
          <span>Latest reading {hoursOrDash(machine.latestReadingHours)}</span>
          <span>Next service due {hoursOrDash(machine.nextServiceDueHours)}</span>
          {machine.hoursToService !== null ? (
            <span className="font-medium">{hoursToServiceLabel(machine.hoursToService)}</span>
          ) : null}
          <div className="ml-auto flex gap-2">
            {canCapture ? (
              <Button variant="outline" onClick={() => setCapturing(true)}>
                Capture reading
              </Button>
            ) : null}
            {canRecord ? <Button onClick={() => setOpening(true)}>Record a service</Button> : null}
          </div>
        </div>
        <ErrorMessage error={records.error ?? mechanics.error} fallbackMessage="Unable to load Service Records." />
        {canRecord
          ? openRecords.map((record) => (
              <OpenServiceForm
                key={record.id}
                record={record}
                mechanicOptions={mechanicOptions}
                onClose={() => setClosingId(record.id)}
              />
            ))
          : null}
      </CardContent>
      <SpotCaptureDialog machine={machine} open={capturing} onOpenChange={setCapturing} />
      <RecordServiceDialog
        machineId={machine.id}
        open={opening}
        onOpenChange={setOpening}
        mechanicOptions={mechanicOptions}
      />
      {closing ? (
        <CloseServiceRecordDialog
          key={closing.id}
          machine={machine}
          record={closing}
          mechanicOptions={mechanicOptions}
          onClose={() => setClosingId(null)}
        />
      ) : null}
    </Card>
  );
}

/** A service still in the workshop: its dates, Mechanic and notes autosave until it is closed. */
function OpenServiceForm({
  record,
  mechanicOptions,
  onClose,
}: {
  record: ServiceRecord;
  mechanicOptions: readonly SearchableComboboxOption[];
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const write = useContractingWrite(useQueryInvalidation().invalidateServices);
  const patch = useMutation(trpc.contractingServices.patch.mutationOptions({ onSuccess: write.invalidate }));
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
    <form {...formProps} aria-label="Service in the workshop" className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">In the workshop since {formatDate(record.startDate, 'short')}</span>
        <div className="flex items-center gap-2">
          <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              // The close dialog starts from the saved record, so a note typed a moment ago lands first.
              if (await autosave.flush()) onClose();
              else showError(new Error('Resolve unsaved changes before closing the service.'), 'Unable to close.');
            }}
          >
            Close
          </Button>
        </div>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <form.AppField name="startDate">
          {(field) => <field.DatePickerField label="Start date" onValueCommit={autosave.commit} />}
        </form.AppField>
        <form.AppField name="primaryMechanicUserId">
          {(field) => (
            <field.ComboboxField
              label="Mechanic"
              placeholder="Search mechanics..."
              emptyMessage="No mechanics found."
              options={mechanicFieldOptions(mechanicOptions, record)}
              onValueCommit={autosave.commit}
            />
          )}
        </form.AppField>
      </div>
      <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" />}</form.AppField>
    </form>
  );
}
