import type { FleetListInput, Implement } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
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
import { createImplementInput, fleetStatusLabels, fleetStatusOptions, ImplementCreateValues } from './types.js';

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
  const { invalidateFleet } = useQueryInvalidation();
  const canEdit = useCan('contracting_machine:update').can;
  const [status, setStatus] = useState<FleetListInput['status']>('active');
  // The suggestion fills the code only until the user types in it.
  const codeEdited = useRef(false);
  const query = useQuery(trpc.contractingFleet.implements.list.queryOptions({ status }));
  const categories = useQuery(trpc.contractingFleet.categories.list.queryOptions({ kind: 'implement' }));
  const flow = useCreateEntityFlow({
    mutation: trpc.contractingFleet.implements.create.mutationOptions(),
    errorMessage: 'Unable to create implement.',
    invalidate: invalidateFleet,
    navigateTo: (row) => ({ to: '/contracting/fleet/implements/$id/edit', params: { id: row.id } }),
  });
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
                flow.open();
              }}
            >
              New implement
            </Button>
          ) : undefined
        }
      >
        <ErrorMessage error={query.error ?? categories.error} fallbackMessage="Unable to load implements." />
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
          onOpen={(row) => void navigate({ to: '/contracting/fleet/implements/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <CreateEntityDialog
        {...flow.dialogProps}
        title="New implement"
        defaultValues={{ categoryId: '', code: '' }}
        validator={ImplementCreateValues}
        canSubmit={categories.isSuccess}
        description={
          categories.data?.length === 0 ? 'Create an Implement category before adding an Implement.' : undefined
        }
        onCreate={(values) => flow.create(createImplementInput(values))}
      >
        {(form) => (
          <>
            <form.AppField name="categoryId">
              {() => <CategoryPickerField categories={categories.data ?? []} />}
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
