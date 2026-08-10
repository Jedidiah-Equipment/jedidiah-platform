import { formatCurrency, formatDate } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatEstimateFloor, missingEstimateLabels } from '../../../products/product-cost-estimate-display.js';

export function JobCostComparisonSummary({ jobId }: { jobId: UUID }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.inventory.jobCostComparison.queryOptions({ jobId }));

  if (query.isPending) return <Skeleton className="h-28 w-full" />;
  if (query.error) return <p className="text-destructive text-sm">Unable to load the Job cost comparison.</p>;
  if (query.data.snapshot === null) {
    return <p className="text-muted-foreground text-sm">This Job has no Product estimate snapshot.</p>;
  }

  const { actualCost, estimateVariance, snapshot } = query.data;
  const estimate = snapshot.estimate;
  const missing = missingEstimateLabels(estimate.missing);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estimate vs actual</CardTitle>
        <CardDescription>
          Estimate frozen {formatDate(snapshot.createdAt)}; actual cost uses the values stamped on this Job's draws.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <CostTerm label="Materials" value={formatCurrency(estimate.materialCostFloor, 'ZAR')} />
          <CostTerm label="Assembly parts" value={formatCurrency(estimate.partsCostFloor, 'ZAR')} />
          <CostTerm label="Labor" value={formatCurrency(estimate.laborCostFloor, 'ZAR')} />
          <CostTerm label="Estimate total" value={formatEstimateFloor(estimate.totalCostFloor, estimate.complete)} />
          <CostTerm
            label="Actual drawn"
            value={actualCost === null ? 'Not priced' : formatCurrency(actualCost, 'ZAR')}
          />
          <CostTerm
            label={estimate.complete ? 'Variance' : 'Variance from floor'}
            value={estimateVariance === null ? 'Not priced' : formatCurrency(estimateVariance, 'ZAR')}
          />
        </div>
        {missing.length > 0 ? (
          <p className="text-muted-foreground text-sm">Snapshot missing: {missing.join(', ')}.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CostTerm({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
