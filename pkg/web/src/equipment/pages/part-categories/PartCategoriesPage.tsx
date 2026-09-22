import type { PartCategory } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useTRPC } from '@/lib/trpc.js';
import { PartCategoryCreateDialog } from './PartCategoryCreateDialog.js';

export function PartCategoriesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const query = useQuery(trpc.partCategories.list.queryOptions());
  const columns = useMemo<DataTableColumnDef<PartCategory>[]>(
    () => [
      { accessorKey: 'name', header: 'Name', enableSorting: true },
      {
        accessorFn: (category) => category.markupPercent ?? undefined,
        id: 'markupPercent',
        header: 'Markup',
        enableSorting: true,
        sortUndefined: 'last',
        cell: ({ row }) => <PartCategoryMarkup markupPercent={row.original.markupPercent} />,
      },
      { accessorKey: 'partCount', header: 'Parts', enableSorting: true },
    ],
    [],
  );

  return (
    <>
      <PageLayout
        title="Part categories"
        description="The groups every Part belongs to. Parts pick from this list; the Parts CSV matches it by name."
        size="lg"
        actions={<Button onClick={() => setCreateOpen(true)}>New Part Category</Button>}
      >
        <ErrorMessage error={query.error} fallbackMessage="Unable to load Part Categories." />
        <ClientDataTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          emptyMessage="No Part Categories yet."
          searchPlaceholder="Search Part Categories…"
          onOpen={(row) => void navigate({ to: '/equipment/part-categories/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <PartCategoryCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(category) => navigate({ to: '/equipment/part-categories/$id/edit', params: { id: category.id } })}
      />
    </>
  );
}

export function PartCategoryMarkup({ markupPercent }: { markupPercent: number | null }) {
  return markupPercent === null ? <span className="text-muted-foreground">Not set</span> : `${markupPercent}%`;
}
