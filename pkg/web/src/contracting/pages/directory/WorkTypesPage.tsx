import { type WorkType, WorkTypeName } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { DirectoryTable } from './DirectoryTable.js';
import { useDirectoryInvalidation } from './use-directory-invalidation.js';

const WorkTypeCreateValues = z.object({ name: WorkTypeName });
export function WorkTypesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const invalidate = useDirectoryInvalidation();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_directory:update').can;
  const [open, setOpen] = useState(false);
  const query = useQuery(trpc.contractingDirectory.workTypes.list.queryOptions());
  const create = useMutation(
    trpc.contractingDirectory.workTypes.create.mutationOptions({
      onError: (error) => showError(error, 'Unable to create work type.'),
    }),
  );
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
        actions={canEdit ? <Button onClick={() => setOpen(true)}>New work type</Button> : undefined}
      >
        <ErrorMessage error={query.error} fallbackMessage="Unable to load work types." />
        <DirectoryTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          searchPlaceholder="Search work types…"
          onOpen={(row) => void navigate({ to: '/contracting/work-types/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <CreateEntityDialog
        key={open ? 'open' : 'closed'}
        open={open}
        onOpenChange={setOpen}
        title="New work type"
        defaultValues={{ name: '' }}
        validator={WorkTypeCreateValues}
        onCreate={(values) => create.mutateAsync(values)}
        onCreated={async (row) => {
          await invalidate();
          setOpen(false);
          await navigate({ to: '/contracting/work-types/$id/edit', params: { id: row.id } });
        }}
      >
        {(form) => <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>}
      </CreateEntityDialog>
    </>
  );
}
