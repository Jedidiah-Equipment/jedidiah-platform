import { formatDate, formatHours } from '@pkg/domain';
import { requiredSelection, UUID } from '@pkg/schema';
import type { JohnDeereLinkView, JohnDeereUnlinkedMachine, Machine } from '@pkg/schema/contracting';
import { IconLink, IconLinkOff, IconLoader2, IconRefresh } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { MachinePickerField } from '@/contracting/components/MachinePickerField.js';
import { hoursOrDash } from '@/contracting/components/MachineServiceDue.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

const muted = (text: string) => <span className="text-muted-foreground">{text}</span>;
const dateOrDash = (date: string | null) => (date === null ? muted('—') : formatDate(date, 'medium'));
const orDash = (text: string | null) => text || muted('—');
const makeModelYear = (machine: Pick<JohnDeereUnlinkedMachine, 'make' | 'model' | 'modelYear'>) =>
  orDash([machine.make, machine.model, machine.modelYear].filter(Boolean).join(' · '));

/** The Link and Unlink tables, shown below a Connected card. */
export function JohnDeereLinks() {
  const [linking, setLinking] = useState<JohnDeereUnlinkedMachine | null>(null);
  return (
    <>
      <UnlinkedMachinesCard onLink={setLinking} />
      <LinkedMachinesCard />
      {linking ? <LinkDialog deere={linking} onClose={() => setLinking(null)} /> : null}
    </>
  );
}

function UnlinkedMachinesCard({ onLink }: { onLink: (machine: JohnDeereUnlinkedMachine) => void }) {
  const trpc = useTRPC();
  const { invalidateJohnDeere } = useQueryInvalidation();
  const query = useQuery(trpc.contractingJohnDeere.equipment.list.queryOptions());
  const refresh = useMutation(
    trpc.contractingJohnDeere.equipment.refresh.mutationOptions(
      useContractingWrite(invalidateJohnDeere).card('Unable to refresh the John Deere machines.'),
    ),
  );
  const columns = useMemo<DataTableColumnDef<JohnDeereUnlinkedMachine>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { id: 'makeModelYear', header: 'Make / Model / Year', cell: ({ row }) => makeModelYear(row.original) },
      { accessorKey: 'serialNumber', header: 'PIN', cell: ({ row }) => orDash(row.original.serialNumber) },
      {
        accessorKey: 'lastHours',
        header: 'Last reported hours',
        cell: ({ row }) => hoursOrDash(row.original.lastHours, 'No report'),
      },
      {
        accessorKey: 'lastReportTime',
        header: 'Reported at',
        cell: ({ row }) => dateOrDash(row.original.lastReportTime),
      },
      {
        id: 'link',
        header: () => <span className="sr-only">Link</span>,
        cell: ({ row }) => (
          <Button onClick={() => onLink(row.original)} size="sm" type="button" variant="outline">
            <IconLink data-icon="inline-start" />
            Link
          </Button>
        ),
      },
    ],
    [onLink],
  );
  const busy = refresh.isPending || query.isFetching;
  const rows = query.data ?? [];
  const table = useDataTable({
    columns,
    data: rows,
    getRowId: (row) => row.equipmentId,
    enableColumnFilters: false,
    enableSorting: false,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Unlinked John Deere machines</CardTitle>
        <CardAction>
          <Button disabled={busy} onClick={() => refresh.mutate()} size="sm" type="button" variant="outline">
            {busy ? (
              <IconLoader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <IconRefresh data-icon="inline-start" />
            )}
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DataTable
          table={table}
          total={rows.length}
          paginationMode="complete"
          hideGlobalFilter
          hideFooter
          isLoading={query.isPending}
          loadingRowCount={3}
          errorMessage={getApiQueryErrorMessage(query.error, 'Unable to load the John Deere machines.')}
          emptyMessage="Every John Deere machine is linked."
        />
      </CardContent>
    </Card>
  );
}

const linkStatus = (link: JohnDeereLinkView) => {
  if (link.machine.retiredAt) return <Badge variant="outline">Retired</Badge>;
  if (link.lost) return <Badge variant="destructive">Lost</Badge>;
  return <Badge variant="secondary">OK</Badge>;
};

function LinkedMachinesCard() {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingJohnDeere.links.list.queryOptions());
  const columns = useMemo<DataTableColumnDef<JohnDeereLinkView>[]>(
    () => [
      {
        id: 'machine',
        header: 'Machine',
        cell: ({ row }) => (
          <CategoryLabel
            colour={row.original.machine.categoryColour}
            icon={row.original.machine.categoryIcon}
            name={<span className="font-medium">{row.original.machine.code}</span>}
            size={16}
          />
        ),
      },
      { accessorKey: 'deereName', header: 'John Deere name' },
      { accessorKey: 'serialNumber', header: 'PIN', cell: ({ row }) => orDash(row.original.serialNumber) },
      {
        id: 'lastReport',
        header: 'Last report',
        cell: ({ row }) =>
          row.original.lastReportTime === null || row.original.lastValue === null ? (
            muted('No report')
          ) : (
            <span className="tabular-nums">
              {formatHours(row.original.lastValue)} · {formatDate(row.original.lastReportTime, 'medium')}
            </span>
          ),
      },
      { id: 'status', header: 'Status', cell: ({ row }) => linkStatus(row.original) },
      {
        id: 'unlink',
        header: () => <span className="sr-only">Unlink</span>,
        cell: ({ row }) => <UnlinkButton link={row.original} />,
      },
    ],
    [],
  );
  const rows = query.data ?? [];
  const table = useDataTable({
    columns,
    data: rows,
    getRowId: (row) => row.id,
    enableColumnFilters: false,
    enableSorting: false,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Machines</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          table={table}
          total={rows.length}
          paginationMode="complete"
          hideGlobalFilter
          hideFooter
          isLoading={query.isPending}
          loadingRowCount={3}
          errorMessage={getApiQueryErrorMessage(query.error, 'Unable to load the linked Machines.')}
          emptyMessage="No Machine is linked yet."
        />
      </CardContent>
    </Card>
  );
}

function UnlinkButton({ link }: { link: JohnDeereLinkView }) {
  const trpc = useTRPC();
  const { invalidateJohnDeereLinks } = useQueryInvalidation();
  const remove = useMutation(
    trpc.contractingJohnDeere.links.remove.mutationOptions(
      useContractingWrite(invalidateJohnDeereLinks).card('Unable to unlink the Machine.'),
    ),
  );
  return (
    <RemoveEntityButton
      confirmLabel="Unlink"
      description={`John Deere stops reporting ${link.machine.code}'s hours. Every reading already stored stays.`}
      isPending={remove.isPending}
      onConfirm={() => remove.mutate({ id: link.id })}
      title={`Unlink ${link.machine.code}?`}
      triggerIcon={IconLinkOff}
      triggerLabel="Unlink"
      triggerSize="sm"
      triggerVariant="outline"
    />
  );
}

const LinkValues = z.object({ machineId: requiredSelection(UUID, 'Choose the Machine') });
type LinkValues = z.input<typeof LinkValues>;

/** Links one Deere machine to a Machine, showing both meters side by side once a Machine is picked. */
function LinkDialog({ deere, onClose }: { deere: JohnDeereUnlinkedMachine; onClose: () => void }) {
  const trpc = useTRPC();
  const write = useContractingWrite(useQueryInvalidation().invalidateJohnDeereLinks);
  const link = useMutation(trpc.contractingJohnDeere.links.create.mutationOptions(write.dialog));
  const machines = useQuery(trpc.contractingFleet.machines.list.queryOptions({ status: 'active' }));
  const linkable = useMemo(
    () => (machines.data ?? []).filter((machine) => machine.johnDeere === null),
    [machines.data],
  );
  const defaultValues: LinkValues = { machineId: '' };
  return (
    <CreateEntityDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Link ${deere.name}`}
      description="Link only when the two meters agree for the time between them."
      submitLabel="Link"
      defaultValues={defaultValues}
      validator={LinkValues}
      onCreate={(values) => link.mutateAsync({ machineId: values.machineId, equipmentId: deere.equipmentId })}
      onCreated={onClose}
    >
      {(form) => (
        <>
          <form.AppField name="machineId">
            {() => <MachinePickerField machines={linkable} emptyMessage="No unlinked Machines." />}
          </form.AppField>
          <ErrorMessage error={machines.error} fallbackMessage="Unable to load the Machines." />
          <form.Subscribe selector={(state) => state.values.machineId}>
            {(picked) => <MeterComparison deere={deere} machine={linkable.find((machine) => machine.id === picked)} />}
          </form.Subscribe>
          <ErrorMessage error={link.error} fallbackMessage="Unable to link the Machine." />
        </>
      )}
    </CreateEntityDialog>
  );
}

function MeterComparison({ deere, machine }: { deere: JohnDeereUnlinkedMachine; machine: Machine | undefined }) {
  if (!machine) return null;
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
      <MeterColumn
        title="John Deere"
        name={deere.name}
        detail={`PIN ${deere.serialNumber ?? '—'}`}
        hours={deere.lastHours}
        at={deere.lastReportTime}
        atLabel="Reported at"
      />
      <MeterColumn
        title="Ours"
        name={machine.code}
        detail={`${machine.make} ${machine.model}`}
        hours={machine.latestReadingHours}
        at={machine.latestReadingAt}
        atLabel="Read At"
      />
    </div>
  );
}

function MeterColumn({
  title,
  name,
  detail,
  hours,
  at,
  atLabel,
}: {
  title: string;
  name: string;
  detail: string;
  hours: number | null;
  at: string | null;
  atLabel: string;
}) {
  return (
    <dl className="space-y-2" aria-label={title}>
      <div className="space-y-0.5">
        <dt className="text-muted-foreground">{title}</dt>
        <dd className="font-medium">{name}</dd>
        <dd className="text-muted-foreground">{detail}</dd>
      </div>
      <div className="space-y-0.5">
        <dt className="text-muted-foreground">Hours</dt>
        <dd>{hoursOrDash(hours, 'No report')}</dd>
      </div>
      <div className="space-y-0.5">
        <dt className="text-muted-foreground">{atLabel}</dt>
        <dd>{dateOrDash(at)}</dd>
      </div>
    </dl>
  );
}
