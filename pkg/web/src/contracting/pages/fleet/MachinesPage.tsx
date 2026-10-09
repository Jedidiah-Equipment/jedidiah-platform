import { formatHours } from '@pkg/domain';
import { serviceDueNeedsAttention, serviceDueStatusColorClassNames } from '@pkg/domain/contracting';
import type { FleetListInput, Machine } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { EnumSelect } from '@/components/common/EnumSelect.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { useCreateEntityFlow } from '@/components/form/hooks/use-create-entity-flow.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { CategoryPickerField } from './CategoryFields.js';
import { createMachineInput, fleetStatusLabels, fleetStatusOptions, MachineCreateValues } from './types.js';

export function MachinesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateFleet } = useQueryInvalidation();
  const canEdit = useCan('contracting_machine:update').can;
  const readsJobs = useCan('contracting_job:read').can;
  const [status, setStatus] = useState<FleetListInput['status']>('active');
  const query = useQuery(trpc.contractingFleet.machines.list.queryOptions({ status }));
  const categories = useQuery(trpc.contractingFleet.categories.list.queryOptions({ kind: 'machine' }));
  const options = useQuery(trpc.contractingFleet.machines.options.queryOptions());
  const flow = useCreateEntityFlow({
    mutation: trpc.contractingFleet.machines.create.mutationOptions(),
    errorMessage: 'Unable to create machine.',
    invalidate: invalidateFleet,
    navigateTo: (row) => ({ to: '/contracting/fleet/$id/edit', params: { id: row.id } }),
  });
  const columns = useMemo<DataTableColumnDef<Machine>[]>(
    () => [
      {
        accessorKey: 'categoryName',
        header: 'Category',
        enableGlobalFilter: false,
        enableColumnFilter: true,
        filterFn: 'equalsString',
        cell: ({ row }) => (
          <CategoryLabel
            icon={row.original.categoryIcon}
            colour={row.original.categoryColour}
            name={
              <span className="truncate" title={row.original.categoryName}>
                {row.original.categoryName}
              </span>
            }
            className="min-w-0"
          />
        ),
        meta: {
          filterVariant: 'select',
          filterOptions: (categories.data ?? []).map((row) => ({ label: row.name, value: row.name })),
          headerClassName: 'w-52',
          cellClassName: 'w-52 max-w-52',
        },
      },
      {
        accessorKey: 'code',
        header: 'Code',
        enableSorting: true,
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
      },
      { accessorKey: 'make', header: 'Make', enableGlobalFilter: false },
      { accessorKey: 'model', header: 'Model', enableGlobalFilter: false },
      { accessorKey: 'currentDriverName', header: 'Driver', enableGlobalFilter: false },
      {
        id: 'busyWith',
        header: 'Busy with',
        accessorFn: (machine) =>
          machine.busyOnJob ? `${machine.busyOnJob.customerName} · ${machine.busyOnJob.farmName}` : '',
        enableSorting: true,
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const { busyOnJob, retiredAt } = row.original;
          if (retiredAt) return <Badge variant="outline">Retired</Badge>;
          if (!busyOnJob) return <span className="text-muted-foreground">Free</span>;
          const label = (
            <span
              className="flex min-w-0 flex-col"
              title={`${busyOnJob.jobNumber} · ${busyOnJob.customerName} · ${busyOnJob.farmName}`}
            >
              <span className="truncate font-medium">{busyOnJob.customerName}</span>
              <span className="truncate text-xs text-muted-foreground">{busyOnJob.farmName}</span>
            </span>
          );
          return readsJobs ? (
            <Link
              className="block hover:underline"
              onClick={(event) => event.stopPropagation()}
              params={{ code: busyOnJob.jobNumber }}
              to="/contracting/jobs/$code"
            >
              {label}
            </Link>
          ) : (
            label
          );
        },
      },
      {
        id: 'lastReading',
        header: 'Last reading',
        accessorFn: (machine) => machine.latestReadingHours ?? -1,
        enableSorting: true,
        enableGlobalFilter: false,
        cell: ({ row }) =>
          row.original.latestReadingHours === null ? (
            <span className="text-muted-foreground">No reading</span>
          ) : (
            <span className="flex flex-col">
              <span className="tabular-nums">{formatHours(row.original.latestReadingHours)}</span>
              {row.original.latestReadingAt ? (
                <span className="text-xs text-muted-foreground">
                  <DateDisplay date={row.original.latestReadingAt} format="medium" />
                </span>
              ) : null}
            </span>
          ),
      },
      {
        id: 'nextServiceDue',
        header: 'Next service due',
        accessorFn: (machine) => machine.hoursToService ?? Number.POSITIVE_INFINITY,
        enableSorting: true,
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const { nextServiceDueHours, hoursToService, serviceDueStatus } = row.original;
          if (nextServiceDueHours === null) return <span className="text-muted-foreground">Not set</span>;
          const flagged = serviceDueNeedsAttention(serviceDueStatus);
          return (
            <span className="flex flex-col">
              <span className="tabular-nums">{formatHours(nextServiceDueHours)}</span>
              {hoursToService !== null ? (
                <span
                  className={cn(
                    'text-xs',
                    flagged ? serviceDueStatusColorClassNames[serviceDueStatus].text : 'text-muted-foreground',
                  )}
                >
                  {hoursToService < 0
                    ? `Overdue by ${formatHours(-hoursToService)}`
                    : `${formatHours(hoursToService)} to go`}
                </span>
              ) : null}
            </span>
          );
        },
      },
    ],
    [categories.data, readsJobs],
  );
  return (
    <>
      <PageLayout
        title="Machines"
        description="Manage the Contracting fleet and Machine Yard."
        actions={canEdit ? <Button onClick={flow.open}>New machine</Button> : undefined}
      >
        <ErrorMessage
          error={query.error ?? categories.error ?? options.error}
          fallbackMessage="Unable to load fleet."
        />
        <ClientDataTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          emptyMessage="No fleet entries found."
          searchPlaceholder="Search codes..."
          controls={
            <EnumSelect
              aria-label="Fleet status"
              value={status}
              onChange={setStatus}
              options={fleetStatusOptions}
              labels={fleetStatusLabels}
            />
          }
          onOpen={(row) => void navigate({ to: '/contracting/fleet/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <CreateEntityDialog
        {...flow.dialogProps}
        title="New machine"
        defaultValues={{ code: '', make: '', model: '', categoryId: '' }}
        validator={MachineCreateValues}
        canSubmit={categories.isSuccess && options.isSuccess}
        description={categories.data?.length === 0 ? 'Create a Machine category before adding a Machine.' : undefined}
        onCreate={(values) => flow.create(createMachineInput(values))}
      >
        {(form) => (
          <>
            <form.AppField name="code">{(field) => <field.TextField label="Code" />}</form.AppField>
            <form.AppField name="make">
              {(field) => <field.CreatableComboboxField label="Make" options={options.data?.makes ?? []} />}
            </form.AppField>
            <form.AppField name="model">
              {(field) => <field.CreatableComboboxField label="Model" options={options.data?.models ?? []} />}
            </form.AppField>
            <form.AppField name="categoryId">
              {() => <CategoryPickerField categories={categories.data ?? []} />}
            </form.AppField>
          </>
        )}
      </CreateEntityDialog>
    </>
  );
}
