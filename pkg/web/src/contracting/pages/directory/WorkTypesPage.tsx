import type { WorkType } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { useCreateEntityFlow } from '@/components/form/hooks/use-create-entity-flow.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { WorkTypeCreateValues } from './types.js';

export function WorkTypesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateDirectory } = useQueryInvalidation();
  const canEdit = useCan('contracting_directory:update').can;
  const query = useQuery(trpc.contractingDirectory.workTypes.list.queryOptions());
  const flow = useCreateEntityFlow({
    mutation: trpc.contractingDirectory.workTypes.create.mutationOptions(),
    errorMessage: 'Unable to create work type.',
    invalidate: invalidateDirectory,
    navigateTo: (row) => ({ to: '/contracting/work-types/$id/edit', params: { id: row.id } }),
  });
  const columns = useMemo<DataTableColumnDef<WorkType>[]>(
    () => [
      { accessorKey: 'name', header: 'Name', enableSorting: true },
      { accessorKey: 'active', header: 'Status', cell: ({ row }) => (row.original.active ? 'Active' : 'Inactive') },
    ],
    [],
  );
  return (
    <>
      <PageLayout
        title="Work types"
        description="Kinds of contracted work. Inactive types stay in history and leave pickers."
        size="lg"
        actions={canEdit ? <Button onClick={flow.open}>New work type</Button> : undefined}
      >
        <ErrorMessage error={query.error} fallbackMessage="Unable to load work types." />
        <ClientDataTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          emptyMessage="No entries found."
          searchPlaceholder="Search work types…"
          onOpen={(row) => void navigate({ to: '/contracting/work-types/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <CreateEntityDialog
        {...flow.dialogProps}
        title="New work type"
        defaultValues={{ name: '' }}
        validator={WorkTypeCreateValues}
        onCreate={flow.create}
      >
        {(form) => <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>}
      </CreateEntityDialog>
    </>
  );
}
