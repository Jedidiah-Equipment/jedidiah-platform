import type { FleetListInput, Machine } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { FleetStatusFilter } from './FleetStatusFilter.js';
import { FleetTable } from './FleetTable.js';
import { createMachineInput, MachineCreateValues } from './types.js';
import { useFleetInvalidation } from './use-fleet-invalidation.js';
export function MachinesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const invalidate = useFleetInvalidation();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_machine:update').can;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<FleetListInput['status']>('active');
  const query = useQuery(trpc.contractingFleet.machines.list.queryOptions({ status }));
  const categories = useQuery(trpc.contractingFleet.categories.list.queryOptions());
  const options = useQuery(trpc.contractingFleet.machines.options.queryOptions());
  const create = useMutation(
    trpc.contractingFleet.machines.create.mutationOptions({
      onError: (error) => showError(error, 'Unable to create machine.'),
    }),
  );
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
        actions={canEdit ? <Button onClick={() => setOpen(true)}>New machine</Button> : undefined}
      >
        <ErrorMessage
          error={query.error ?? categories.error ?? options.error}
          fallbackMessage="Unable to load fleet."
        />
        <FleetTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          controls={<FleetStatusFilter value={status} onChange={setStatus} />}
          onOpen={(row) => void navigate({ to: '/contracting/fleet/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <CreateEntityDialog
        key={open ? 'open' : 'closed'}
        open={open}
        onOpenChange={setOpen}
        title="New machine"
        defaultValues={{ code: '', make: '', model: '', categoryId: '' }}
        validator={MachineCreateValues}
        canSubmit={categories.isSuccess && options.isSuccess}
        description={categories.data?.length === 0 ? 'Create a Category before adding a Machine.' : undefined}
        onCreate={(values) => create.mutateAsync(createMachineInput(values))}
        onCreated={async (row) => {
          await invalidate();
          setOpen(false);
          await navigate({ to: '/contracting/fleet/$id/edit', params: { id: row.id } });
        }}
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
              {(field) => (
                <field.SelectField
                  label="Category"
                  options={(categories.data ?? []).map((row) => ({ label: row.name, value: row.id }))}
                />
              )}
            </form.AppField>
          </>
        )}
      </CreateEntityDialog>
    </>
  );
}
