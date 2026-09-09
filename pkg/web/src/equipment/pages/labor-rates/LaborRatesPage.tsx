import { formatCurrency } from '@pkg/domain';
import { departmentLabels } from '@pkg/domain/equipment';
import { type LaborRateCard, LaborRateCardUpdateInput, type VisibleLaborRateCard } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { LaborRatesEditDialog } from './LaborRatesEditDialog.js';

type Rate = VisibleLaborRateCard['rates'][number];

export function LaborRatesPage() {
  const trpc = useTRPC();
  const access = useCan('equipment_labor_rate:read');
  const query = useQuery(trpc.laborRates.get.queryOptions(undefined, { enabled: access.can }));
  return (
    <PageLayout title="Labor rates" description="Hourly rates and overheads for work Departments." size="lg">
      <ErrorMessage error={query.error ?? access.error} fallbackMessage="Unable to load Labor rates." />
      {access.isPending || (access.can && query.isPending) ? (
        <p>Loading Labor rates…</p>
      ) : !access.can ? (
        <p>You do not have permission to view Labor rates.</p>
      ) : null}
      {access.can && query.data ? <LaborRatesCard card={query.data} /> : null}
    </PageLayout>
  );
}

function LaborRatesCard({ card }: { card: VisibleLaborRateCard }) {
  const canUpdate = useCan('equipment_labor_rate:update').can;
  const canReadCosts = card.managementOverheadPercentage !== undefined;
  // Capture a fresh card on each open. Refetches update the table without replacing an open draft.
  const [editingCard, setEditingCard] = useState<LaborRateCard | null>(null);
  const columns = useMemo<DataTableColumnDef<Rate>[]>(
    () => [
      { accessorKey: 'department', header: 'Department', cell: ({ row }) => departmentLabels[row.original.department] },
      ...(canReadCosts ? [rateColumn('costToCompanyRate', 'Cost to company (R/hour)')] : []),
      rateColumn('billingRate', 'Billing (R/hour)'),
      ...(canReadCosts ? [rateColumn('consumablesPercentage', 'Consumables (%)')] : []),
    ],
    [canReadCosts],
  );
  const table = useDataTable({
    columns,
    data: card.rates,
    getRowId: (row) => row.department,
    enableColumnFilters: false,
    enableSorting: false,
  });
  const editableCard = LaborRateCardUpdateInput.safeParse(card);
  return (
    <div className="grid gap-4">
      {canUpdate && editableCard.success ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditingCard(editableCard.data)}>Edit rates</Button>
        </div>
      ) : null}
      <Card>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            {canReadCosts ? (
              <div>
                <dt className="text-sm text-muted-foreground">Management overhead (%)</dt>
                <dd>{card.managementOverheadPercentage}%</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-sm text-muted-foreground">Hours per working day</dt>
              <dd>{card.hoursPerWorkingDay}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <DataTable
        table={table}
        total={card.rates.length}
        paginationMode="complete"
        hideGlobalFilter
        emptyMessage="No Labor rates."
      />
      <p className="text-sm text-muted-foreground">
        Blank or zero cost-to-company rates make product cost estimates incomplete. Billing rates seed new Work Items;
        existing Quotes keep their rates.
      </p>
      {editingCard ? <LaborRatesEditDialog card={editingCard} onClose={() => setEditingCard(null)} /> : null}
    </div>
  );
}

function rateColumn(
  field: 'costToCompanyRate' | 'billingRate' | 'consumablesPercentage',
  header: string,
): DataTableColumnDef<Rate> {
  return {
    accessorKey: field,
    header,
    cell: ({ row }) => {
      const value = row.original[field];
      return value == null ? 'Not set' : field === 'consumablesPercentage' ? `${value}%` : formatCurrency(value, 'ZAR');
    },
  };
}
