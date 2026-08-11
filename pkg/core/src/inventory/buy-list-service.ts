import {
  type DatabaseTransaction,
  type Db,
  jobs,
  parts,
  products,
  productUnits,
  quotes,
  stockMovements,
  supplier,
} from '@pkg/db';
import { compareBuyListRows, compareNullableDateOnly, deriveBuyListSignal, toPlantDateOnly } from '@pkg/domain';
import type { BuyListResult, DateOnlyIso } from '@pkg/schema';
import { BuyListResult as BuyListResultSchema } from '@pkg/schema';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';

import { findBoardBayRowsForJobs, toProjectedBoard } from '../jobs/board-read.js';
import { jobDisplayNameOf, jobDisplaySelection } from '../jobs/job-display.js';
import { listWorkingCalendarOffDays } from '../jobs/working-calendar-service.js';
import { loadOpenOrderLines } from '../purchase-orders/purchase-order-service.js';
import { loadOpenCommitments, type OpenCommitmentRow, sumCommitmentsByPart } from './commitment-read.js';

/**
 * Procurement's radar (spec §3, §12): every Part the shop is short of, why, how much of it is
 * already coming, and which Job is waiting soonest.
 *
 * One list carries all three reasons a Part lands here — short for Jobs, below its reorder level,
 * off the shelf entirely — because they are read together and a Part is routinely more than one at
 * once. Nothing on it ever raises an order by itself: the row is an invitation to tick, and the
 * ticking is what creates a draft (spec §9's "never an automatic PO").
 */
export async function listBuyList({
  clock = () => new Date(),
  db,
}: {
  clock?: () => Date;
  db: Db;
}): Promise<BuyListResult> {
  // Quantity, commitment and on-order are one procurement fact; a receipt landing mid-read must not
  // let a row claim cover its shortfall was never measured against.
  return db.transaction((tx) => listBuyListSnapshot(tx, toPlantDateOnly(clock())), {
    accessMode: 'read only',
    isolationLevel: 'repeatable read',
  });
}

async function listBuyListSnapshot(db: DatabaseTransaction, today: DateOnlyIso): Promise<BuyListResult> {
  const [partRows, commitments, openOrderLines] = await Promise.all([
    db
      .select({
        isInternallyFabricated: parts.isInternallyFabricated,
        minimumStock: parts.minimumStock,
        partCode: parts.code,
        partId: parts.id,
        partName: parts.name,
        standardPurchaseLengthMm: parts.standardPurchaseLengthMm,
        stockTrackingMode: parts.stockTrackingMode,
        // A Part with no ledger at all has never been stocked, so it has not run out (spec §9).
        hasStockHistory: sql<boolean>`count(${stockMovements.id}) > 0`,
        // A revaluation moves cost, never quantity, so it must not reach a stock-on-hand sum.
        quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision`,
        supplierId: parts.supplierId,
        supplierName: supplier.companyName,
        unitOfMeasure: parts.unitOfMeasure,
      })
      .from(parts)
      .leftJoin(
        stockMovements,
        and(eq(stockMovements.partId, parts.id), ne(stockMovements.movementType, 'revaluation')),
      )
      .leftJoin(supplier, eq(supplier.id, parts.supplierId))
      .groupBy(parts.id, supplier.companyName)
      .orderBy(asc(parts.code)),
    loadOpenCommitments(db),
    loadOpenOrderLines({ db }),
  ]);

  const committedByPart = sumCommitmentsByPart(commitments);
  const onOrderByPart = new Map<string, number>();
  const coveringOrdersByPart = new Map<string, CoveringOrderFacts[]>();

  for (const line of openOrderLines) {
    onOrderByPart.set(line.partId, (onOrderByPart.get(line.partId) ?? 0) + line.outstandingQuantity);
    coveringOrdersByPart.set(line.partId, [
      ...(coveringOrdersByPart.get(line.partId) ?? []),
      {
        code: line.purchaseOrderCode,
        expectedDeliveryDate: line.expectedDeliveryDate,
        id: line.purchaseOrderId,
        outstandingQuantity: line.outstandingQuantity,
      },
    ]);
  }

  const signalled = partRows.flatMap((part) => {
    const committed = committedByPart.get(part.partId) ?? 0;
    const free = part.quantity - committed;
    const onOrder = onOrderByPart.get(part.partId) ?? 0;
    const signal = deriveBuyListSignal({
      free,
      hasStockHistory: part.hasStockHistory,
      minimumStock: part.minimumStock,
      onOrder,
      quantity: part.quantity,
    });

    return signal.reasons.length === 0 ? [] : [{ ...part, ...signal, committed, free, onOrder }];
  });

  if (signalled.length === 0) return { items: [] };

  const signalledPartIds = new Set(signalled.map((row) => row.partId));
  const drivingJobsByPart = await loadDrivingJobs({
    commitments: commitments.filter((row) => signalledPartIds.has(row.partId)),
    db,
    today,
  });

  return BuyListResultSchema.parse({
    items: signalled
      .map((row) => {
        const drivingJobs = drivingJobsByPart.get(row.partId) ?? [];

        return {
          ...row,
          coveringOrders: coveringOrdersByPart.get(row.partId) ?? [],
          drivingJobs,
          earliestDemandDate: earliestSlotDateOf(drivingJobs),
        };
      })
      .sort(compareBuyListRows),
  });
}

/**
 * Codes are integers in the database and branded display strings on the wire, so everything this
 * module assembles is typed as the schema's *input* and branded once by the parse at the boundary.
 */
type CoveringOrderFacts = {
  code: number;
  expectedDeliveryDate: string | null;
  id: string;
  outstandingQuantity: number;
};

type DrivingJobFacts = {
  code: number;
  committedQuantity: number;
  displayName: string;
  earliestSlotDate: DateOnlyIso | null;
  id: string;
};

/** The minimum over the driving Jobs' Slot dates; null when not one of them is on the board. */
function earliestSlotDateOf(drivingJobs: readonly DrivingJobFacts[]): DateOnlyIso | null {
  return drivingJobs.reduce<DateOnlyIso | null>((earliest, job) => {
    if (job.earliestSlotDate === null) return earliest;

    return earliest === null || job.earliestSlotDate < earliest ? job.earliestSlotDate : earliest;
  }, null);
}

/**
 * The Jobs behind each shortfall, each carrying the date its work actually starts.
 *
 * The date is the Job's earliest **unfinished** Work Slot, taken from the same Board projection the
 * planning screens read — Slot dates reflow as queues move, so a stored start would rank the list
 * by a date the shop floor no longer believes. A Job holding commitment but no Slot has no date at
 * all, which the ranking reads as "not urgent" rather than "urgent now".
 */
async function loadDrivingJobs({
  commitments,
  db,
  today,
}: {
  commitments: readonly OpenCommitmentRow[];
  db: DatabaseTransaction;
  today: DateOnlyIso;
}): Promise<Map<string, DrivingJobFacts[]>> {
  const jobIds = [...new Set(commitments.map((row) => row.jobId))];
  if (jobIds.length === 0) return new Map();

  const [jobRows, offDays, bayRows] = await Promise.all([
    db
      .select({ ...jobDisplaySelection, id: jobs.id })
      .from(jobs)
      .leftJoin(productUnits, eq(productUnits.id, jobs.productUnitId))
      .leftJoin(products, eq(products.id, productUnits.productId))
      .leftJoin(quotes, eq(quotes.id, jobs.quoteId))
      .where(inArray(jobs.id, jobIds)),
    listWorkingCalendarOffDays(db),
    findBoardBayRowsForJobs({ db, jobIds }),
  ]);
  const earliestSlotDates = new Map<string, DateOnlyIso>();

  for (const queue of toProjectedBoard(bayRows, { offDays, today }).queues) {
    for (const slot of queue.slots) {
      if (slot.kind !== 'work' || slot.state === 'done') continue;
      const current = earliestSlotDates.get(slot.jobId);
      if (current === undefined || slot.startDate < current) earliestSlotDates.set(slot.jobId, slot.startDate);
    }
  }

  const jobFactsById = new Map(jobRows.map((row) => [row.id, row]));
  const byPart = new Map<string, DrivingJobFacts[]>();

  for (const commitment of commitments) {
    const job = jobFactsById.get(commitment.jobId);
    if (!job) continue;

    byPart.set(commitment.partId, [
      ...(byPart.get(commitment.partId) ?? []),
      {
        code: job.code,
        committedQuantity: commitment.committedQuantity,
        displayName: jobDisplayNameOf(job),
        earliestSlotDate: earliestSlotDates.get(commitment.jobId) ?? null,
        id: commitment.jobId,
      },
    ]);
  }

  // Soonest-needed Job first, so a row's own list reads the same way the buy list itself is ranked.
  for (const [partId, drivingJobs] of byPart) {
    byPart.set(partId, [...drivingJobs].sort(compareDrivingJobs));
  }

  return byPart;
}

/** The list's own ranking rule, over Job codes rather than Part codes: unscheduled Jobs sort last. */
function compareDrivingJobs(left: DrivingJobFacts, right: DrivingJobFacts): number {
  return compareNullableDateOnly(left.earliestSlotDate, right.earliestSlotDate) || left.code - right.code;
}
