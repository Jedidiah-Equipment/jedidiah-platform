import { type DatabaseTransaction, jobEstimateSnapshots, jobs } from '@pkg/db';
import { deriveEstimatedStockOnHand } from '@pkg/domain';
import type { EstimatedStockOnHand, UUID } from '@pkg/schema';
import { and, eq, gte, lte, or, sql } from 'drizzle-orm';

export type EstimatedStockRequest = {
  anchorAt: Date | null;
  averageUtilizationPercent: number;
  key: string;
  originAt: Date | null;
  partId: UUID;
  recordedOnHand: number;
  throughAt: Date;
};

export async function loadEstimatedStockOnHand(
  db: DatabaseTransaction,
  requests: readonly EstimatedStockRequest[],
): Promise<Map<string, EstimatedStockOnHand>> {
  if (requests.length === 0) return new Map();

  const origins = requests.flatMap((request) => (request.originAt === null ? [] : [request.originAt]));
  if (origins.length === 0) {
    return new Map(requests.map((request) => [request.key, deriveEstimate(request, [])]));
  }

  const earliestOrigin = new Date(Math.min(...origins.map((date) => date.getTime())));
  const latestThrough = new Date(Math.max(...requests.map((request) => request.throughAt.getTime())));
  const requestedPartIds = [...new Set(requests.map((request) => request.partId))];
  const matchesRequestedPart = or(
    ...requestedPartIds.map(
      (partId) =>
        sql`${jobEstimateSnapshots.payload} @> ${JSON.stringify({ materialLines: [{ partId }], scope: 'build' })}::jsonb`,
    ),
  );
  const snapshotRows = await db
    .select({ cancelledAt: jobs.cancelledAt, createdAt: jobs.createdAt, payload: jobEstimateSnapshots.payload })
    .from(jobEstimateSnapshots)
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, jobEstimateSnapshots.jobId),
        gte(jobs.createdAt, earliestOrigin),
        lte(jobs.createdAt, latestThrough),
        matchesRequestedPart,
      ),
    );
  const demandByPart = new Map<UUID, DemandEvent[]>();

  for (const row of snapshotRows) {
    for (const line of row.payload.materialLines) {
      const event = { cancelledAt: row.cancelledAt, createdAt: row.createdAt, quantity: line.quantityPerUnit };
      const existing = demandByPart.get(line.partId);
      if (existing) existing.push(event);
      else demandByPart.set(line.partId, [event]);
    }
  }

  return new Map(
    requests.map((request) => [request.key, deriveEstimate(request, demandByPart.get(request.partId) ?? [])]),
  );
}

type DemandEvent = { cancelledAt: Date | null; createdAt: Date; quantity: number };

function deriveEstimate(request: EstimatedStockRequest, demandEvents: readonly DemandEvent[]): EstimatedStockOnHand {
  const originAt = request.originAt;
  const anchorAt = request.anchorAt ?? originAt;
  const qualifying =
    originAt === null
      ? []
      : demandEvents.filter(
          (event) =>
            event.createdAt >= originAt &&
            event.createdAt <= request.throughAt &&
            (event.cancelledAt === null || event.cancelledAt > request.throughAt),
        );
  const cumulativeDemandNow = qualifying.reduce((total, event) => total + event.quantity, 0);
  const cumulativeDemandAtAnchor =
    anchorAt === null
      ? 0
      : qualifying.reduce((total, event) => total + (event.createdAt <= anchorAt ? event.quantity : 0), 0);

  return deriveEstimatedStockOnHand({
    cumulativeDemandAtAnchor,
    cumulativeDemandNow,
    recordedOnHand: request.recordedOnHand,
    utilization: request.averageUtilizationPercent / 100,
  });
}
