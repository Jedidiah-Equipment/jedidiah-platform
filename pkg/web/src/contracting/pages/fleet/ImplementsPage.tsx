import type { FleetListInput, Implement } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
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
import { createImplementInput, ImplementCreateValues } from './types.js';
import { useFleetInvalidation } from './use-fleet-invalidation.js';

const columns: DataTableColumnDef<Implement>[] = [
  { accessorKey: 'code', header: 'Code', enableSorting: true },
  { accessorKey: 'implementType', header: 'Implement type', enableGlobalFilter: false, enableSorting: true },
  { accessorKey: 'notes', header: 'Notes', enableGlobalFilter: false },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <Badge variant="outline">{row.original.retiredAt ? 'Retired' : 'Active'}</Badge>,
  },
];
export function ImplementsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const invalidate = useFleetInvalidation();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_machine:update').can;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<FleetListInput['status']>('active');
  const query = useQuery(trpc.contractingFleet.implements.list.queryOptions({ status }));
  const options = useQuery(trpc.contractingFleet.implements.options.queryOptions());
  const create = useMutation(
    trpc.contractingFleet.implements.create.mutationOptions({
      onError: (error) => showError(error, 'Unable to create implement.'),
    }),
  );
  return (
    <>
      <PageLayout
        title="Implements"
        description="Un-metered fleet attachments."
        size="lg"
        actions={canEdit ? <Button onClick={() => setOpen(true)}>New implement</Button> : undefined}
      >
        <ErrorMessage error={query.error ?? options.error} fallbackMessage="Unable to load implements." />
        <FleetTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          controls={<FleetStatusFilter value={status} onChange={setStatus} />}
          onOpen={(row) => void navigate({ to: '/contracting/fleet/implements/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <CreateEntityDialog
        key={open ? 'open' : 'closed'}
        open={open}
        onOpenChange={setOpen}
        title="New implement"
        defaultValues={{ code: '', implementType: '' }}
        validator={ImplementCreateValues}
        canSubmit={options.isSuccess}
        onCreate={(values) => create.mutateAsync(createImplementInput(values))}
        onCreated={async (row) => {
          await invalidate();
          setOpen(false);
          await navigate({ to: '/contracting/fleet/implements/$id/edit', params: { id: row.id } });
        }}
      >
        {(form) => (
          <>
            <form.AppField name="code">{(field) => <field.TextField label="Code" />}</form.AppField>
            <form.AppField name="implementType">
              {(field) => <field.CreatableComboboxField label="Implement type" options={options.data ?? []} />}
            </form.AppField>
          </>
        )}
      </CreateEntityDialog>
    </>
  );
}
