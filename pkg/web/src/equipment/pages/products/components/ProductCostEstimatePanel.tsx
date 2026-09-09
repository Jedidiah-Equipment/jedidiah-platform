import { formatCurrency, formatNumber } from '@pkg/domain';
import { departmentLabels, productLaborTotal } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import type {
  ProductCostEstimateAssembly,
  ProductCostEstimateLaborLine,
  ProductCostEstimateMaterialLine,
  ProductCostEstimatePartLine,
} from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import type { RowData } from '@tanstack/react-table';
import type React from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardDescription, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { formatPartQuantity, formatUnitCostBasis } from '@/equipment/utils/part-quantity-format.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  estimateTermCompleteness,
  formatEstimateCeiling,
  formatEstimateFloor,
  missingEstimateLabels,
} from '../product-cost-estimate-display.js';

export function ProductCostEstimatePanel({ productId }: { productId: UUID }) {
  const trpc = useTRPC();
  const costAccess = useCan('equipment_inventory_cost:read');
  const query = useQuery(trpc.products.costEstimate.queryOptions({ productId }, { enabled: costAccess.can }));

  if (!costAccess.can) return null;
  if (query.isPending) return <Skeleton className="h-48 w-full" />;
  if (query.error)
    return <ErrorMessage error={query.error} fallbackMessage="Unable to load the Product cost estimate." />;

  const estimate = query.data;
  const missing = missingEstimateLabels(estimate.missing);
  const termComplete = estimateTermCompleteness(estimate);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live cost estimate</CardTitle>
        <CardDescription>
          Current moving-average material and part costs with the Labor Rate Card’s cost-to-company rates, consumables
          and management overhead. This estimate updates when inputs, rates or inventory costs change.
        </CardDescription>
      </CardHeader>
      <CardSeparator />
      <CardContent className="grid gap-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <EstimateTerm floor={!termComplete.material} label="Materials per unit" value={estimate.materialCostFloor} />
          <EstimateTerm floor={!termComplete.parts} label="Assembly parts" value={estimate.partsCostFloor} />
          <EstimateTerm floor={!termComplete.labor} label="Labor and overheads" value={productLaborTotal(estimate)} />
          <EstimateTerm label="Estimated total" value={estimate.totalCostFloor} floor={!estimate.complete} />
          <EstimateTerm label="Base price" value={estimate.basePrice} />
          <EstimateTerm ceiling={!estimate.complete} label="Estimated margin" value={estimate.estimatedMarginCeiling} />
        </div>

        {missing.length > 0 ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            {formatEstimateFloor(estimate.totalCostFloor, false)} — missing: {missing.join(', ')}.
          </p>
        ) : null}

        <EstimateSection title="Raw materials per unit">
          <EstimateDataTable
            columns={materialColumns}
            data={estimate.materialLines}
            emptyMessage="No raw-material list recorded."
            totalLabel="material lines"
          />
        </EstimateSection>

        <EstimateSection title="Assembly parts">
          <div className="grid gap-5">
            {estimate.assemblies.length === 0 ? (
              <p className="text-muted-foreground text-sm">No effective BOM parts.</p>
            ) : null}
            {estimate.assemblies.map((assembly) => (
              <AssemblyEstimate key={assembly.assemblyId} assembly={assembly} />
            ))}
          </div>
        </EstimateSection>

        {estimate.optionalAssemblies.length > 0 ? (
          <EstimateSection title="Optional Assemblies">
            <div className="grid gap-5">
              {estimate.optionalAssemblies.map((assembly) => (
                <AssemblyEstimate key={assembly.assemblyId} assembly={assembly} />
              ))}
            </div>
          </EstimateSection>
        ) : null}

        <EstimateSection title="Labor per unit">
          <EstimateDataTable
            columns={laborColumns}
            data={estimate.laborHours}
            emptyMessage="No labor per unit recorded."
            totalLabel="Departments"
          />
          <dl className="grid gap-1 text-sm sm:ml-auto sm:w-96">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                Management overhead ({formatNumber(estimate.managementOverheadPercentage)}% of labor cost)
              </dt>
              <dd className="tabular-nums">{formatCurrency(estimate.managementOverheadCostFloor, 'ZAR')}</dd>
            </div>
            <div className="flex justify-between gap-4 font-medium">
              <dt>Labor total</dt>
              <dd className="tabular-nums">{formatEstimateFloor(productLaborTotal(estimate), termComplete.labor)}</dd>
            </div>
          </dl>
        </EstimateSection>
      </CardContent>
    </Card>
  );
}

function EstimateTerm({
  ceiling = false,
  floor = false,
  label,
  value,
}: {
  ceiling?: boolean;
  floor?: boolean;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold tabular-nums">
        {ceiling ? formatEstimateCeiling(value, false) : formatEstimateFloor(value, !floor)}
      </p>
    </div>
  );
}

function EstimateSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="grid gap-2">
      <h3 className="font-medium text-sm">{title}</h3>
      {children}
    </section>
  );
}

function AssemblyEstimate({ assembly }: { assembly: ProductCostEstimateAssembly }) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{assembly.assemblyName}</span>
          {assembly.partial ? <Badge variant="outline">Partial</Badge> : null}
        </div>
        <p className="text-muted-foreground tabular-nums">
          {assembly.partial ? 'Bought-parts cost' : 'Parts cost'}:{' '}
          {formatEstimateFloor(assembly.costFloor, assembly.complete)}
          {assembly.upgradePrice === null ? '' : ` · upgrade delta ${formatCurrency(assembly.upgradePrice, 'ZAR')}`}
        </p>
      </div>
      <EstimateDataTable
        columns={partColumns}
        data={assembly.parts}
        emptyMessage="No Parts in this Assembly."
        totalLabel="Parts"
      />
    </div>
  );
}

function EstimateDataTable<T extends RowData>({
  columns,
  data,
  emptyMessage,
  totalLabel,
}: {
  columns: DataTableColumnDef<T>[];
  data: T[];
  emptyMessage: string;
  totalLabel: string;
}) {
  // Columns here are numeric or pre-formatted for display, not written for client-side sorting or
  // filtering: 'auto' would range-parse a typed string per character and sort formatted numbers as text.
  const table = useDataTable({ columns, data, enableColumnFilters: false, enableSorting: false });

  return (
    <DataTable
      emptyMessage={emptyMessage}
      hideGlobalFilter
      paginationMode="complete"
      table={table}
      total={data.length}
      totalLabel={(total) => `${total} ${totalLabel}`}
    />
  );
}

const partIdentityColumn = {
  accessorFn: (line: ProductCostEstimatePartLine | ProductCostEstimateMaterialLine) =>
    `${line.partName} ${line.partCode}`,
  cell: ({ row }: { row: { original: ProductCostEstimatePartLine | ProductCostEstimateMaterialLine } }) => (
    <>
      <span className="block font-medium">{row.original.partName}</span>
      <span className="text-muted-foreground text-xs">{row.original.partCode}</span>
    </>
  ),
  header: 'Part',
  id: 'part',
};

/**
 * A linear Part is costed by the whole piece it is bought as, while its average is held per millimetre
 * — so the figure needs the piece named under it, or R0.038/mm reads back as a R38.00 unit cost with
 * nothing to explain the thousandfold.
 */
function UnitCostCell({
  fallback,
  line,
}: {
  fallback: string;
  line: Pick<ProductCostEstimateMaterialLine, 'standardPurchaseLengthMm' | 'unitCost' | 'unitOfMeasure'>;
}) {
  if (line.unitCost === null) return fallback;

  const basis = formatUnitCostBasis(line);

  return (
    <>
      <span className="block tabular-nums">{formatCurrency(line.unitCost, 'ZAR')}</span>
      {basis === null ? null : <span className="text-muted-foreground text-xs">{basis}</span>}
    </>
  );
}

const materialColumns: DataTableColumnDef<ProductCostEstimateMaterialLine>[] = [
  partIdentityColumn,
  {
    accessorKey: 'quantityPerUnit',
    cell: ({ row }) => formatPartQuantity(row.original.quantityPerUnit, row.original.unitOfMeasure),
    header: 'Quantity per unit',
  },
  {
    accessorKey: 'unitCost',
    cell: ({ row }) => <UnitCostCell fallback="No cost yet" line={row.original} />,
    header: 'Unit cost',
  },
  { accessorKey: 'costFloor', cell: ({ row }) => formatCurrency(row.original.costFloor, 'ZAR'), header: 'Cost' },
];

const partColumns: DataTableColumnDef<ProductCostEstimatePartLine>[] = [
  partIdentityColumn,
  {
    accessorKey: 'quantity',
    cell: ({ row }) => formatPartQuantity(row.original.quantity, row.original.unitOfMeasure),
    header: 'Quantity',
  },
  {
    accessorKey: 'unitCost',
    cell: ({ row }) => (
      <UnitCostCell
        fallback={row.original.isInternallyFabricated ? 'Included via raw materials' : 'No cost yet'}
        line={row.original}
      />
    ),
    header: 'Unit cost',
  },
  { accessorKey: 'costFloor', cell: ({ row }) => formatCurrency(row.original.costFloor, 'ZAR'), header: 'Cost' },
];

const laborColumns: DataTableColumnDef<ProductCostEstimateLaborLine>[] = [
  { accessorKey: 'department', cell: ({ row }) => departmentLabels[row.original.department], header: 'Department' },
  {
    accessorKey: 'daysPerStaff',
    cell: ({ row }) => formatNumber(row.original.daysPerStaff, { decimals: 2 }),
    header: 'Days per staff member',
  },
  { accessorKey: 'staffCount', header: 'Staff' },
  { accessorKey: 'hours', cell: ({ row }) => formatNumber(row.original.hours, { decimals: 2 }), header: 'Hours' },
  { accessorKey: 'hourlyRate', cell: ({ row }) => formatCurrency(row.original.hourlyRate, 'ZAR'), header: 'Rate' },
  {
    accessorKey: 'laborCost',
    cell: ({ row }) => formatCurrency(row.original.laborCost, 'ZAR'),
    header: 'Labor cost',
  },
  {
    accessorKey: 'consumablesCost',
    cell: ({ row }) => (
      <>
        <span className="block tabular-nums">{formatCurrency(row.original.consumablesCost, 'ZAR')}</span>
        <span className="text-muted-foreground text-xs">{formatNumber(row.original.consumablesPercentage)}%</span>
      </>
    ),
    header: 'Consumables',
  },
  {
    accessorKey: 'departmentTotal',
    cell: ({ row }) => formatCurrency(row.original.departmentTotal, 'ZAR'),
    header: 'Department total',
  },
];
