import { departmentLabels } from '@pkg/domain/equipment';
import type { VisibleLaborRateCard } from '@pkg/schema/equipment';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { laborRateFieldLabel, parseLaborRateForm } from './types.js';

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
      {access.can && query.data ? <LaborRatesForm card={query.data} /> : null}
    </PageLayout>
  );
}

function LaborRatesForm({ card }: { card: VisibleLaborRateCard }) {
  const trpc = useTRPC();
  const canUpdate = useCan('equipment_labor_rate:update').can;
  const canReadCosts = card.managementOverheadPercentage !== undefined;
  const invalidate = useQueryInvalidation();
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [formCard, setFormCard] = useState(card);
  useEffect(() => {
    // A clean form follows the latest card; a background read must not replace an unsaved draft.
    if (!dirty) setFormCard(card);
  }, [card, dirty]);
  const save = useMutation(
    trpc.laborRates.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          invalidate.invalidateLaborRates(),
          invalidate.invalidateProducts(),
          invalidate.invalidateAudit(),
        ]);
        setDirty(false);
        setMessage('Labor rates saved.');
      },
    }),
  );
  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm('Leave without saving Labor rates?'),
    enableBeforeUnload: dirty,
  });
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
    data: formCard.rates,
    getRowId: (row) => row.department,
    enableColumnFilters: false,
    enableSorting: false,
  });
  return (
    <form
      key={JSON.stringify(formCard)}
      className="grid gap-4"
      onChange={() => {
        setDirty(true);
        setMessage('');
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        const parsed = parseLaborRateForm(new FormData(event.currentTarget));
        if (!parsed.success) {
          setMessage(
            parsed.error.issues.map((issue) => `${laborRateFieldLabel(issue.path)}: ${issue.message}`).join(' '),
          );
          return;
        }
        setMessage('');
        save.mutate(parsed.data);
      }}
    >
      <fieldset disabled={!canUpdate || save.isPending || !canReadCosts} className="grid gap-4">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {canReadCosts ? (
              <label htmlFor="managementOverheadPercentage" className="grid gap-2 text-sm">
                Management overhead (%)
                <Input
                  id="managementOverheadPercentage"
                  name="managementOverheadPercentage"
                  type="number"
                  step="any"
                  defaultValue={formCard.managementOverheadPercentage}
                  required
                />
              </label>
            ) : null}
            <label htmlFor="hoursPerWorkingDay" className="grid gap-2 text-sm">
              Hours per working day
              <Input
                id="hoursPerWorkingDay"
                name="hoursPerWorkingDay"
                type="number"
                step="any"
                defaultValue={formCard.hoursPerWorkingDay}
                required
              />
            </label>
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
        <div>
          <Button type="submit" disabled={!dirty}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </fieldset>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      <ErrorMessage error={save.error} fallbackMessage="Unable to save Labor rates." />
    </form>
  );
}

function rateColumn(
  field: 'costToCompanyRate' | 'billingRate' | 'consumablesPercentage',
  header: string,
): DataTableColumnDef<Rate> {
  return {
    accessorKey: field,
    header,
    cell: ({ row }) => (
      <Input
        aria-label={`${departmentLabels[row.original.department]} ${header}`}
        name={`${row.original.department}.${field}`}
        type="number"
        step="any"
        defaultValue={row.original[field] ?? ''}
        placeholder="Not set"
        className="min-w-28"
      />
    ),
  };
}
