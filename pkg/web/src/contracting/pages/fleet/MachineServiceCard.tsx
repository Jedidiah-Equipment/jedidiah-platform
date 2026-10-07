import { formatDate, formatHours, getPlantDateNow } from '@pkg/domain';
import { serviceDueStatusColorClassNames, serviceDueStatusLabels } from '@pkg/domain/contracting';
import type { Machine, ServiceRecord } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { AutosaveStatus, CreateEntityDialog, useAutosaveForm } from '@/components/form/index.js';
import { HelpLink } from '@/components/help/index.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { mechanicFieldOptions } from '@/contracting/components/MechanicCombobox.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { CloseServiceRecordDialog } from './CloseServiceRecordDialog.js';
import { OpenServiceValues, openServiceFields } from './types.js';

const hoursOrDash = (hours: number | null) => (hours === null ? '—' : formatHours(hours));

function toService(hoursToService: number | null) {
  if (hoursToService === null) return null;
  return hoursToService < 0
    ? `Overdue by ${formatHours(-hoursToService)}`
    : `${formatHours(hoursToService)} to service`;
}

/** Where the Machine stands on service, and the services still in the workshop; the History card lists the past ones. */
export function MachineServiceCard({ machine }: { machine: Machine }) {
  const trpc = useTRPC();
  const readsServices = useCan('contracting_service:read').can;
  const canRecord = useCan('contracting_service:update').can && !machine.retiredAt;
  const records = useQuery(
    trpc.contractingServices.list.queryOptions({ machineId: machine.id }, { enabled: readsServices && canRecord }),
  );
  const mechanics = useQuery(
    trpc.contractingServices.options.mechanics.queryOptions(undefined, { enabled: canRecord }),
  );
  const mechanicOptions = useMemo(
    () => (mechanics.data ?? []).map((person) => ({ value: person.id, label: person.name })),
    [mechanics.data],
  );
  const [opening, setOpening] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const openRecords = (records.data ?? []).filter((record) => record.status === 'open');
  const closing = openRecords.find((record) => record.id === closingId);
  const colours = serviceDueStatusColorClassNames[machine.serviceDueStatus];
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
          <Badge className={cn(colours.chip, colours.text)} variant="outline">
            {serviceDueStatusLabels[machine.serviceDueStatus]}
          </Badge>
          <span>Latest reading {hoursOrDash(machine.latestReadingHours)}</span>
          <span>Next service due {hoursOrDash(machine.nextServiceDueHours)}</span>
          {toService(machine.hoursToService) ? (
            <span className="font-medium">{toService(machine.hoursToService)}</span>
          ) : null}
          {canRecord ? (
            <Button className="ml-auto" onClick={() => setOpening(true)}>
              Record a service
            </Button>
          ) : null}
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

function RecordServiceDialog({
  machineId,
  open,
  onOpenChange,
  mechanicOptions,
}: {
  machineId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mechanicOptions: readonly SearchableComboboxOption[];
}) {
  const trpc = useTRPC();
  const write = useContractingWrite(useQueryInvalidation().invalidateServices);
  const record = useMutation(trpc.contractingServices.open.mutationOptions(write.dialog));
  const defaultValues: OpenServiceValues = { startDate: getPlantDateNow(), primaryMechanicUserId: '', notes: '' };
  return (
    <CreateEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record a service"
      description="Book the Machine in. Close the service when it leaves the workshop."
      submitLabel="Record service"
      defaultValues={defaultValues}
      validator={OpenServiceValues}
      onCreate={(values) => record.mutateAsync({ machineId, ...openServiceFields(values) })}
      onCreated={() => onOpenChange(false)}
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
          <Button size="sm" variant="outline" onClick={onClose}>
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
