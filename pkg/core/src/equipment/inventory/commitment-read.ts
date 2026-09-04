import { jobCfoAssemblies, jobCfoParts, jobs, stockMovements } from '@pkg/db/equipment';
import { deriveCommitment } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import { JOB_STOCK_MOVEMENT_TYPES } from '@pkg/schema/equipment';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { jobIsNotClosedOut } from './close-out-service.js';
import type { LedgerDb } from './ledger.js';

/** One Job's open demand for one Part: what the CFO asked for, less what the Job has already drawn. */
export type OpenCommitmentRow = {
  committedQuantity: number;
  jobId: UUID;
  partId: UUID;
};

/**
 * Every open commitment in the plant, kept per Job rather than pre-summed.
 *
 * Free Stock only needs the per-Part total, but the buy list needs to know *which* Jobs are waiting
 * so it can rank a Part by the earliest of their Slot dates (spec §3). Reading it once at the finer
 * grain and folding it here is what keeps the two surfaces from disagreeing about what is committed.
 *
 * `partIds` narrows the scan for a caller that only cares about a handful of Parts — a Job's stock
 * tab, not the whole-plant report. It cannot change any Part's total: the filter drops whole Parts,
 * never some of the Jobs committed to one.
 */
export async function loadOpenCommitments(db: LedgerDb, partIds?: readonly UUID[]): Promise<OpenCommitmentRow[]> {
  // Narrowing by Part never changes a total: it drops whole Parts, never some Jobs of one.
  const partScope = partIds === undefined ? undefined : [...partIds];
  if (partScope?.length === 0) return [];

  const [cfoRows, drawnRows] = await Promise.all([
    db
      .select({
        cfoQuantity: sql<number>`sum(${jobCfoParts.quantity})::double precision`,
        jobId: jobCfoAssemblies.jobId,
        partId: jobCfoParts.partId,
      })
      .from(jobCfoAssemblies)
      .innerJoin(jobCfoParts, eq(jobCfoParts.cfoAssemblyId, jobCfoAssemblies.id))
      .innerJoin(jobs, eq(jobs.id, jobCfoAssemblies.jobId))
      // Close-out releases the remainder permanently, so a closed Job's CFO never reaches the sum
      // again — later returns move drawn, but there is no open demand left for them to re-open.
      .where(
        and(
          isNull(jobs.cancelledAt),
          jobIsNotClosedOut(jobs.id),
          partScope ? inArray(jobCfoParts.partId, partScope) : undefined,
        ),
      )
      .groupBy(jobCfoAssemblies.jobId, jobCfoParts.partId),
    db
      .select({
        drawnQuantity: sql<number>`(-sum(${stockMovements.delta}))::double precision`,
        jobId: stockMovements.jobId,
        partId: stockMovements.partId,
      })
      .from(stockMovements)
      .innerJoin(jobs, eq(jobs.id, stockMovements.jobId))
      .where(
        and(
          isNull(jobs.cancelledAt),
          inArray(stockMovements.movementType, JOB_STOCK_MOVEMENT_TYPES),
          partScope ? inArray(stockMovements.partId, partScope) : undefined,
        ),
      )
      .groupBy(stockMovements.jobId, stockMovements.partId),
  ]);
  const drawnByJobPart = new Map(
    drawnRows.flatMap((row) => (row.jobId ? [[commitmentKey(row.jobId, row.partId), row.drawnQuantity] as const] : [])),
  );

  return cfoRows.flatMap((row) => {
    const committedQuantity = deriveCommitment({
      cfoQuantity: row.cfoQuantity,
      drawnQuantity: drawnByJobPart.get(commitmentKey(row.jobId, row.partId)) ?? 0,
    });

    return committedQuantity > 0 ? [{ committedQuantity, jobId: row.jobId, partId: row.partId }] : [];
  });
}

export function sumCommitmentsByPart(rows: readonly OpenCommitmentRow[]): Map<UUID, number> {
  const committedByPart = new Map<UUID, number>();

  for (const row of rows) {
    committedByPart.set(row.partId, (committedByPart.get(row.partId) ?? 0) + row.committedQuantity);
  }

  return committedByPart;
}

function commitmentKey(jobId: string, partId: string): string {
  return `${jobId}:${partId}`;
}
