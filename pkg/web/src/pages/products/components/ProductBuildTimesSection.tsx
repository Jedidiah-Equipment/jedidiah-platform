import { departmentCrewLabels, departmentLabels, formatDate, formatNumber, WORK_ITEM_DEPARTMENTS } from '@pkg/domain';
import type { ProductBuildMetrics, UUID, WorkItemDepartment } from '@pkg/schema';
import { formatJobCode } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { HelpLink } from '@/components/help/index.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

type Build = ProductBuildMetrics['builds'][number];
type RankingRow = NonNullable<ProductBuildMetrics['ranking']>[number];

/**
 * How long this Product's builds actually took in each work Department, against how long they were
 * scheduled to take. The figures accumulate from stamped builds only.
 */
export const ProductBuildTimesSection: React.FC<{ productId: UUID }> = ({ productId }) => {
  const trpc = useTRPC();
  const canReadMetrics = useCan('job_metrics:read').can;
  const [department, setDepartment] = useState<WorkItemDepartment>('fabrication');
  const metricsQuery = useQuery(trpc.products.buildMetrics.queryOptions({ department, productId }));
  const metrics = metricsQuery.data;
  const departmentLabel = departmentLabels[department];
  const lowerDepartmentLabel = departmentLabel.toLowerCase();

  return (
    <div className="grid gap-4">
      <Tabs onValueChange={(value) => setDepartment(value as WorkItemDepartment)} value={department}>
        <TabsList>
          {WORK_ITEM_DEPARTMENTS.map((workDepartment) => (
            <TabsTrigger key={workDepartment} value={workDepartment}>
              {departmentLabels[workDepartment]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Average {lowerDepartmentLabel} build time
            <HelpLink label="How to read Product build times" topic="productBuildTimes" />
          </CardTitle>
          <CardDescription>
            Elapsed working days between the {lowerDepartmentLabel} start and done stamps, across this Product's builds.
            Builds with no stamps are not counted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ErrorMessage error={metricsQuery.error} fallbackMessage="Unable to load build times." />
          {metricsQuery.isPending ? <Skeleton className="h-8 w-64" /> : null}
          {metrics ? <BuildTimeHeadline department={department} metrics={metrics} /> : null}
        </CardContent>
      </Card>

      {metrics && metrics.builds.length > 0 ? (
        <BuildBreakdownCard builds={metrics.builds} department={department} />
      ) : null}
      {canReadMetrics && metrics?.ranking && metrics.ranking.length > 0 ? (
        <DepartmentCrewRankingCard department={department} ranking={metrics.ranking} />
      ) : null}
    </div>
  );
};

const BuildTimeHeadline: React.FC<{ department: WorkItemDepartment; metrics: ProductBuildMetrics }> = ({
  department,
  metrics,
}) => {
  if (metrics.averageWorkingDays === null) {
    return (
      <p className="text-muted-foreground text-sm">
        — · No stamped builds yet. Figures start once {departmentLabels[department].toLowerCase()} is stamped done on a
        build.
      </p>
    );
  }

  return (
    <p className="text-lg">
      <span className="font-medium">{formatNumber(metrics.averageWorkingDays, { decimals: 1 })}</span> working days
      across {metrics.buildCount} {metrics.buildCount === 1 ? 'build' : 'builds'}
    </p>
  );
};

const BuildBreakdownCard: React.FC<{ builds: Build[]; department: WorkItemDepartment }> = ({ builds, department }) => {
  const columns = useMemo<DataTableColumnDef<Build>[]>(
    () => [
      {
        cell: ({ row }) => (
          <Link className="underline-offset-4 hover:underline" search={{ job: row.original.jobId }} to="/jobs">
            {formatJobCode(row.original.jobCode)}
          </Link>
        ),
        header: 'Job',
        id: 'jobCode',
      },
      { accessorKey: 'productSerialNumber', header: 'Serial' },
      {
        accessorFn: (build) => build.scheduledWorkingDays ?? '—',
        header: 'Scheduled days',
        id: 'scheduledWorkingDays',
      },
      { accessorKey: 'actualWorkingDays', header: 'Actual days' },
      { accessorKey: 'crewSize', header: 'Crew' },
      {
        cell: ({ row }) => formatDate(row.original.completedAt, 'short'),
        header: 'Done',
        id: 'completedAt',
      },
    ],
    [],
  );
  const table = useDataTable({
    columns,
    data: builds,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (build) => build.jobId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Builds counted</CardTitle>
        <CardDescription>
          Every Build Job with both {departmentLabels[department].toLowerCase()} stamps, oldest first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          emptyMessage="No stamped builds yet."
          hideGlobalFilter
          paginationMode="complete"
          table={table}
          total={builds.length}
          totalLabel={(value) => `${value} ${value === 1 ? 'build' : 'builds'}`}
        />
      </CardContent>
    </Card>
  );
};

const DepartmentCrewRankingCard: React.FC<{ department: WorkItemDepartment; ranking: RankingRow[] }> = ({
  department,
  ranking,
}) => {
  const crewLabels = departmentCrewLabels[department];
  const columns = useMemo<DataTableColumnDef<RankingRow>[]>(
    () => [
      { accessorKey: 'name', header: crewLabels.singular },
      {
        accessorFn: (row) => formatNumber(row.averageWorkingDays, { decimals: 1 }),
        header: 'Average days',
        id: 'averageWorkingDays',
      },
      { accessorKey: 'buildCount', header: 'Builds' },
      {
        accessorFn: (row) => formatNumber(row.averageCrewSize, { decimals: 1 }),
        header: 'Average crew',
        id: 'averageCrewSize',
      },
    ],
    [crewLabels.singular],
  );
  const table = useDataTable({
    columns,
    data: ranking,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (row) => row.userId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{crewLabels.collection}</CardTitle>
        <CardDescription>
          Each {crewLabels.singular.toLowerCase()} carries the full elapsed time of every build they crewed — the
          average crew size beside it says what that time was worked under.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          emptyMessage="Nobody has been named on a stamped build yet."
          hideGlobalFilter
          paginationMode="complete"
          table={table}
          total={ranking.length}
          totalLabel={(value) =>
            `${value} ${value === 1 ? crewLabels.singular.toLowerCase() : crewLabels.plural.toLowerCase()}`
          }
        />
      </CardContent>
    </Card>
  );
};
