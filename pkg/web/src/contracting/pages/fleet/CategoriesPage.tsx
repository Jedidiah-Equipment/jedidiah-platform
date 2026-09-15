import { DEFAULT_CATEGORY_COLOUR, defaultCategoryIcon } from '@pkg/domain/contracting';
import type { Category, CategoryKind } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { EnumSelect } from '@/components/common/EnumSelect.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { useCreateEntityFlow } from '@/components/form/hooks/use-create-entity-flow.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  CategoryColourField,
  CategoryIconField,
  type CategoryKindFilterValue,
  categoryKindFilterLabels,
  categoryKindFilterOptions,
  categoryKindLabels,
  categoryKindOptions,
  iconAfterKindChange,
} from './CategoryFields.js';
import { CategoryFormValues } from './types.js';

const columns: DataTableColumnDef<Category>[] = [
  {
    accessorKey: 'name',
    header: 'Category',
    enableSorting: true,
    cell: ({ row }) => (
      <CategoryLabel
        icon={row.original.icon}
        colour={row.original.colour}
        name={row.original.name}
        className="font-medium"
      />
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
  const { invalidateFleet } = useQueryInvalidation();
  const canEdit = useCan('contracting_machine:update').can;
  const [kind, setKind] = useState<CategoryKindFilterValue>('all');
  const query = useQuery(trpc.contractingFleet.categories.list.queryOptions(kind === 'all' ? {} : { kind }));
  const flow = useCreateEntityFlow({
    mutation: trpc.contractingFleet.categories.create.mutationOptions(),
    errorMessage: 'Unable to create category.',
    invalidate: invalidateFleet,
    navigateTo: (row) => ({ to: '/contracting/fleet/categories/$id/edit', params: { id: row.id } }),
  });
  const createKind: CategoryKind = kind === 'implement' ? 'implement' : 'machine';
  return (
    <>
      <PageLayout
        title="Categories"
        description="Machine and Implement groupings, each with the icon and colour its fleet shows."
        size="lg"
        actions={canEdit ? <Button onClick={flow.open}>New category</Button> : undefined}
      >
        <ErrorMessage error={query.error} fallbackMessage="Unable to load categories." />
        <ClientDataTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          emptyMessage="No fleet entries found."
          searchPlaceholder="Search categories…"
          controls={
            <EnumSelect
              aria-label="Category kind"
              value={kind}
              onChange={setKind}
              options={categoryKindFilterOptions}
              labels={categoryKindFilterLabels}
            />
          }
          onOpen={(row) => void navigate({ to: '/contracting/fleet/categories/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <CreateEntityDialog
        {...flow.dialogProps}
        title="New category"
        defaultValues={{
          name: '',
          kind: createKind,
          icon: defaultCategoryIcon(createKind),
          colour: DEFAULT_CATEGORY_COLOUR,
        }}
        validator={CategoryFormValues}
        onCreate={flow.create}
      >
        {(form) => (
          <>
            <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
            <form.AppField name="kind">
              {(field) => (
                <field.SelectField
                  label="Kind"
                  options={categoryKindOptions}
                  onValueCommit={(value) => {
                    if (value === 'machine' || value === 'implement')
                      form.setFieldValue('icon', iconAfterKindChange(value, form.getFieldValue('icon')));
                  }}
                />
              )}
            </form.AppField>
            <form.Subscribe selector={(state) => [state.values.icon, state.values.colour] as const}>
              {([icon, colour]) => (
                <>
                  <form.AppField name="icon">{() => <CategoryIconField colour={colour} />}</form.AppField>
                  <form.AppField name="colour">{() => <CategoryColourField icon={icon} />}</form.AppField>
                </>
              )}
            </form.Subscribe>
          </>
        )}
      </CreateEntityDialog>
    </>
  );
}
