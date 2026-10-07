import { formatDate, formatHours, getPlantDateNow } from '@pkg/domain';
import { serviceDueStatusColorClassNames, serviceDueStatusLabels } from '@pkg/domain/contracting';
import type { Machine, ServiceRecord } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { AutosaveStatus, CreateEntityDialog, useAutosaveForm } from '@/components/form/index.js';
import { HelpLink } from '@/components/help/index.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useWorkshopWrite } from '@/contracting/pages/workshop/use-workshop-write.js';
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

export function MachineServiceCard({ machine }: { machine: Machine }) {
  const trpc = useTRPC();
  const readsServices = useCan('contracting_service:read').can;
  const canRecord = useCan('contracting_service:update').can && !machine.retiredAt;
  const records = useQuery(
    trpc.contractingServices.list.queryOptions({ machineId: machine.id }, { enabled: readsServices }),
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
  const closing = records.data?.find((record) => record.id === closingId) ?? null;
  const openRecords = (records.data ?? []).filter((record) => record.status === 'open');
  const colours = serviceDueStatusColorClassNames[machine.serviceDueStatus];
  const columns = useMemo<DataTableColumnDef<ServiceRecord>[]>(
    () => [
      {
        accessorKey: 'startDate',
        header: 'Start',
        enableSorting: true,
        cell: ({ row }) => formatDate(row.original.startDate, 'short'),
      },
      {
        accessorKey: 'endDate',
        header: 'End',
        cell: ({ row }) => (row.original.endDate ? formatDate(row.original.endDate, 'short') : '—'),
      },
      {
        accessorKey: 'readingAtServiceHours',
        header: 'Reading at service',
        cell: ({ row }) => hoursOrDash(row.original.readingAtServiceHours),
      },
      { accessorKey: 'mechanicName', header: 'Mechanic', cell: ({ row }) => row.original.mechanicName ?? '—' },
      {
        accessorKey: 'nextServiceDueHoursSet',
        header: 'Next due set',
        cell: ({ row }) => hoursOrDash(row.original.nextServiceDueHoursSet),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.status === 'open' ? (
            canRecord ? (
              <Button
                size="sm"
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation();
                  setClosingId(row.original.id);
                }}
              >
                Close
              </Button>
            ) : (
              'In the workshop'
            )
          ) : (
            'Closed'
          ),
      },
    ],
    [canRecord],
  );
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
              <OpenServiceForm key={record.id} record={record} mechanicOptions={mechanicOptions} />
            ))
          : null}
        <ClientDataTable
          rows={records.data ?? []}
          columns={columns}
          loading={records.isPending}
          onOpen={(record) => {
            if (canRecord && record.status === 'open') setClosingId(record.id);
          }}
          emptyMessage="No services recorded."
          hideGlobalFilter
        />
      </CardContent>
      <RecordServiceDialog
        machineId={machine.id}
        open={opening}
        onOpenChange={setOpening}
        mechanicOptions={mechanicOptions}
      />
      <CloseServiceRecordDialog
        machine={machine}
        record={closing}
        mechanicOptions={mechanicOptions}
        onClose={() => setClosingId(null)}
      />
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
  mechanicOptions: { value: string; label: string }[];
}) {
  const trpc = useTRPC();
  const write = useWorkshopWrite();
  const record = useMutation(trpc.contractingServices.open.mutationOptions(write.dialog));
  return (
    <CreateEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record a service"
      description="Book the Machine in. Close the service when it leaves the workshop."
      submitLabel="Record service"
      defaultValues={{ startDate: getPlantDateNow(), primaryMechanicUserId: '', notes: '' } as OpenServiceValues}
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
                options={[{ label: 'No mechanic', value: '' }, ...mechanicOptions]}
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
}: {
  record: ServiceRecord;
  mechanicOptions: { value: string; label: string }[];
}) {
  const trpc = useTRPC();
  const write = useWorkshopWrite();
  const patch = useMutation(trpc.contractingServices.patch.mutationOptions({ onSuccess: write.invalidateWorkshop }));
  const options = [...mechanicOptions];
  if (record.primaryMechanicUserId && !options.some((option) => option.value === record.primaryMechanicUserId))
    options.push({ value: record.primaryMechanicUserId, label: record.mechanicName ?? 'Unavailable mechanic' });
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: {
      startDate: record.startDate,
      primaryMechanicUserId: record.primaryMechanicUserId ?? '',
      notes: record.notes ?? '',
    } as OpenServiceValues,
    failureMessage: 'Unable to update the service.',
    validator: OpenServiceValues,
    toInput: (values) => ({ id: record.id, ...openServiceFields(values) }),
    save: (input) => patch.mutateAsync(input),
  });
  return (
    <form {...formProps} aria-label="Service in the workshop" className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">In the workshop since {formatDate(record.startDate, 'short')}</span>
        <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
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
              options={[{ label: 'No mechanic', value: '' }, ...options]}
              onValueCommit={autosave.commit}
            />
          )}
        </form.AppField>
      </div>
      <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" />}</form.AppField>
    </form>
  );
}
