import { type Category, CategoryKind, FleetName } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { CategoryKindFilter, categoryKindLabels, categoryKindOptions } from './CategoryFields.js';
import { FleetTable } from './FleetTable.js';
import { useFleetInvalidation } from './use-fleet-invalidation.js';

const CategoryCreateValues = z.object({ name: FleetName, kind: CategoryKind });
const columns: DataTableColumnDef<Category>[] = [
  {
    accessorKey: 'name',
    header: 'Category',
    enableSorting: true,
    cell: ({ row }) => (
      <span className="flex items-center gap-2 font-medium">
        <CategoryIcon icon={row.original.icon} colour={row.original.colour} />
        {row.original.name}
      </span>
    ),
  },
  {
    accessorKey: 'kind',
    header: 'Kind',
    enableGlobalFilter: false,
    enableSorting: true,
    cell: ({ row }) => categoryKindLabels[row.original.kind],
  },
];
export function CategoriesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const invalidate = useFleetInvalidation();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_machine:update').can;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CategoryKind | 'all'>('all');
  const query = useQuery(trpc.contractingFleet.categories.list.queryOptions(kind === 'all' ? {} : { kind }));
  const create = useMutation(
    trpc.contractingFleet.categories.create.mutationOptions({
      onError: (error) => showError(error, 'Unable to create category.'),
    }),
  );
  return (
    <>
      <PageLayout
        title="Categories"
        description="Machine and Implement groupings, each with the icon and colour its fleet shows."
        size="lg"
        actions={canEdit ? <Button onClick={() => setOpen(true)}>New category</Button> : undefined}
      >
        <ErrorMessage error={query.error} fallbackMessage="Unable to load categories." />
        <FleetTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          searchPlaceholder="Search categories…"
          controls={<CategoryKindFilter value={kind} onChange={setKind} />}
          onOpen={(row) => void navigate({ to: '/contracting/fleet/categories/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <CreateEntityDialog
        key={open ? 'open' : 'closed'}
        open={open}
        onOpenChange={setOpen}
        title="New category"
        description="The icon and colour start at the kind's default; set them on the category once it exists."
        defaultValues={{ name: '', kind: (kind === 'implement' ? 'implement' : 'machine') as CategoryKind }}
        validator={CategoryCreateValues}
        onCreate={(values) => create.mutateAsync(values)}
        onCreated={async (row) => {
          await invalidate();
          setOpen(false);
          await navigate({ to: '/contracting/fleet/categories/$id/edit', params: { id: row.id } });
        }}
      >
        {(form) => (
          <>
            <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
            <form.AppField name="kind">
              {(field) => <field.SelectField label="Kind" options={categoryKindOptions} />}
            </form.AppField>
          </>
        )}
      </CreateEntityDialog>
    </>
  );
}
