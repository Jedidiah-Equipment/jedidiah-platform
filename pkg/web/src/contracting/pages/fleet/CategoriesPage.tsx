import { formatCurrency } from '@pkg/domain';
import { type Category, FleetName } from '@pkg/schema/contracting';
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
import { FleetTable } from './FleetTable.js';
import { useFleetInvalidation } from './use-fleet-invalidation.js';

const CategoryCreateValues = z.object({ name: FleetName });
export function CategoriesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const invalidate = useFleetInvalidation();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_machine:update').can;
  const canReadRates = useCan('contracting_rate:read').can;
  const [open, setOpen] = useState(false);
  const query = useQuery(trpc.contractingFleet.categories.list.queryOptions());
  const create = useMutation(
    trpc.contractingFleet.categories.create.mutationOptions({
      onError: (error) => showError(error, 'Unable to create category.'),
    }),
  );
  const columns = useMemo<DataTableColumnDef<Category>[]>(
    () => [
      { accessorKey: 'name', header: 'Category', enableSorting: true },
      ...(canReadRates
        ? [
            {
              accessorKey: 'presetRate' as const,
              enableGlobalFilter: false,
              header: 'Preset rate (R/hour)',
              cell: ({ row }: { row: { original: Category } }) =>
                row.original.presetRate === undefined ? '—' : formatCurrency(row.original.presetRate),
            },
          ]
        : []),
    ],
    [canReadRates],
  );
  return (
    <>
      <PageLayout
        title="Categories"
        description="Machine groupings and preset hourly rates."
        size="lg"
        actions={canEdit ? <Button onClick={() => setOpen(true)}>New category</Button> : undefined}
      >
        <ErrorMessage error={query.error} fallbackMessage="Unable to load categories." />
        <FleetTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          searchPlaceholder="Search categories…"
          onOpen={(row) => void navigate({ to: '/contracting/fleet/categories/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <CreateEntityDialog
        key={open ? 'open' : 'closed'}
        open={open}
        onOpenChange={setOpen}
        title="New category"
        defaultValues={{ name: '' }}
        validator={CategoryCreateValues}
        onCreate={(values) => create.mutateAsync(values)}
        onCreated={async (row) => {
          await invalidate();
          setOpen(false);
          await navigate({ to: '/contracting/fleet/categories/$id/edit', params: { id: row.id } });
        }}
      >
        {(form) => <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>}
      </CreateEntityDialog>
    </>
  );
}
