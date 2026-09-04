import { formatCurrency, formatDate } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import {
  estimateTermCompleteness,
  formatEstimateCeiling,
  formatEstimateFloor,
  missingEstimateLabels,
} from '@/equipment/pages/products/product-cost-estimate-display.js';
import { useTRPC } from '@/lib/trpc.js';

export function JobCostComparisonSummary({ jobId }: { jobId: UUID }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.inventory.jobCostComparison.queryOptions({ jobId }));

  if (query.isPending) return <Skeleton className="h-28 w-full" />;
  if (query.error) return <p className="text-destructive text-sm">Unable to load the Job cost comparison.</p>;
  if (query.data.snapshot === null) {
    return <p className="text-muted-foreground text-sm">This Job has no Product estimate snapshot.</p>;
  }

  const { actualCost, partsCostVariance, snapshot } = query.data;
  const estimate = snapshot.estimate;
  const missing = missingEstimateLabels(estimate.missing);
  const termComplete = estimateTermCompleteness(estimate);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estimate vs actual</CardTitle>
        <CardDescription>
          Estimate frozen {formatDate(snapshot.createdAt)}; Assembly Parts compare with values stamped on this Job's
          draws. Product-level material and labor are context only.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <CostTerm label="Materials" value={formatEstimateFloor(estimate.materialCostFloor, termComplete.material)} />
          <CostTerm label="Assembly parts" value={formatEstimateFloor(estimate.partsCostFloor, termComplete.parts)} />
          <CostTerm label="Labor" value={formatEstimateFloor(estimate.laborCostFloor, termComplete.labor)} />
          <CostTerm label="Estimate total" value={formatEstimateFloor(estimate.totalCostFloor, estimate.complete)} />
          <CostTerm
            label="Actual drawn parts"
            value={actualCost === null ? 'Not priced' : formatCurrency(actualCost, 'ZAR')}
          />
          <CostTerm
            label={termComplete.parts ? 'Parts variance' : 'Parts variance ceiling'}
            value={
              partsCostVariance === null ? 'Not priced' : formatEstimateCeiling(partsCostVariance, termComplete.parts)
            }
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
