import type { FleetListInput, Implement } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { categoryOptions } from './CategoryFields.js';
import { FleetStatusFilter } from './FleetStatusFilter.js';
import { FleetTable } from './FleetTable.js';
import { createImplementInput, ImplementCreateValues } from './types.js';
import { useFleetInvalidation } from './use-fleet-invalidation.js';

const columns: DataTableColumnDef<Implement>[] = [
  { accessorKey: 'code', header: 'Code', enableSorting: true },
  {
    accessorKey: 'categoryName',
    header: 'Category',
    enableGlobalFilter: false,
    enableSorting: true,
    cell: ({ row }) => (
      <CategoryLabel
        icon={row.original.categoryIcon}
        colour={row.original.categoryColour}
        name={row.original.categoryName}
      />
    ),
  },
  { accessorKey: 'notes', header: 'Notes', enableGlobalFilter: false },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <Badge variant="outline">{row.original.retiredAt ? 'Retired' : 'Active'}</Badge>,
  },
];
/** Fetches the server's suggestion for the chosen category and hands it up; renders nothing. */
function ImplementCodeSuggestion({ categoryId, onSuggest }: { categoryId: string; onSuggest: (code: string) => void }) {
  const trpc = useTRPC();
  const suggestion = useQuery(
    trpc.contractingFleet.implements.suggestCode.queryOptions({ categoryId }, { enabled: categoryId !== '' }),
  );
  const code = suggestion.data?.code;
  useEffect(() => {
    if (code) onSuggest(code);
  }, [code, onSuggest]);
  return null;
}
export function ImplementsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const invalidate = useFleetInvalidation();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_machine:update').can;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<FleetListInput['status']>('active');
  // The suggestion fills the code only until the user types in it.
  const codeEdited = useRef(false);
  const query = useQuery(trpc.contractingFleet.implements.list.queryOptions({ status }));
  const categories = useQuery(trpc.contractingFleet.categories.list.queryOptions({ kind: 'implement' }));
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
        actions={
          canEdit ? (
            <Button
              onClick={() => {
                codeEdited.current = false;
                setOpen(true);
              }}
            >
              New implement
            </Button>
          ) : undefined
        }
      >
        <ErrorMessage error={query.error ?? categories.error} fallbackMessage="Unable to load implements." />
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
        defaultValues={{ categoryId: '', code: '' }}
        validator={ImplementCreateValues}
        canSubmit={categories.isSuccess}
        description={
          categories.data?.length === 0 ? 'Create an Implement category before adding an Implement.' : undefined
        }
        onCreate={(values) => create.mutateAsync(createImplementInput(values))}
        onCreated={async (row) => {
          await invalidate();
          setOpen(false);
          await navigate({ to: '/contracting/fleet/implements/$id/edit', params: { id: row.id } });
        }}
      >
        {(form) => (
          <>
            <form.AppField name="categoryId">
              {(field) => <field.SelectField label="Category" options={categoryOptions(categories.data ?? [])} />}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.categoryId}>
              {(categoryId) => (
                <ImplementCodeSuggestion
                  categoryId={categoryId}
                  onSuggest={(code) => {
                    if (!codeEdited.current) form.setFieldValue('code', code);
                  }}
                />
              )}
            </form.Subscribe>
            <form.AppField name="code">
              {(field) => (
                <field.TextField
                  label="Code"
                  description="Suggested from the category and the next number; edit it before saving if needed."
                  onInput={() => {
                    codeEdited.current = true;
                  }}
                />
              )}
            </form.AppField>
          </>
        )}
      </CreateEntityDialog>
    </>
  );
}
