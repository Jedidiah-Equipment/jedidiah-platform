import type { FleetListInput, Machine } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
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
import { CategoryPickerField } from './CategoryFields.js';
import { createMachineInput, fleetStatusLabels, fleetStatusOptions, MachineCreateValues } from './types.js';

export function MachinesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateFleet } = useQueryInvalidation();
  const canEdit = useCan('contracting_machine:update').can;
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
        accessorKey: 'code',
        header: 'Code',
        enableSorting: true,
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
      },
      { accessorKey: 'make', header: 'Make', enableGlobalFilter: false },
      { accessorKey: 'model', header: 'Model', enableGlobalFilter: false },
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
            name={row.original.categoryName}
          />
        ),
        meta: {
          filterVariant: 'select',
          filterOptions: (categories.data ?? []).map((row) => ({ label: row.name, value: row.name })),
        },
      },
      { accessorKey: 'currentDriverName', header: 'Driver', enableGlobalFilter: false },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.original.retiredAt ? 'outline' : 'secondary'}>
            {row.original.retiredAt ? 'Retired' : 'In Yard'}
          </Badge>
        ),
      },
    ],
    [categories.data],
  );
  return (
    <>
      <PageLayout
        title="Machines"
        description="Manage the Contracting fleet and Machine Yard."
        size="lg"
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
