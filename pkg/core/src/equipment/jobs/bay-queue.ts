import { type DatabaseTransaction, jobBays, jobSlots } from '@pkg/db';
import { getPlantDateNow, resolveInsertAtDatePlacement } from '@pkg/domain';
import { DateOnlyIso, type UUID } from '@pkg/schema';
import { and, asc, desc, eq, gt, gte, lt, sql } from 'drizzle-orm';

import { JobBayNotFoundError, JobSlotBookingDeniedError, JobSlotNotFoundError } from './job-errors.js';
import { loadBayWorkingCalendar } from './working-calendar-service.js';

type JobBayRow = typeof jobBays.$inferSelect;
type JobSlotRow = typeof jobSlots.$inferSelect;

export type BayQueueSlotSpec =
  | { kind: 'work'; jobId: UUID; durationDays: number }
  | { kind: 'idle'; durationDays: number; label: string | null };

export type BayQueueSwapResult = {
  slot: JobSlotRow;
  swapped: {
    beforeSlotOrder: [JobSlotRow['id'], JobSlotRow['id']];
    afterSlotOrder: [JobSlotRow['id'], JobSlotRow['id']];
  } | null;
};

export type BayQueue = {
  bay: JobBayRow;
  /** Books a Slot via Insert at Date; without a start date the placement is a plain append. */
  book(spec: BayQueueSlotSpec, options?: { startDate?: DateOnlyIso | undefined }): Promise<JobSlotRow>;
  insertRelative(targetSlotId: UUID, placement: 'before' | 'after', spec: BayQueueSlotSpec): Promise<JobSlotRow>;
  resize(slotId: UUID, durationDays: number): Promise<JobSlotRow>;
  swap(slotId: UUID, direction: 'left' | 'right'): Promise<BayQueueSwapResult>;
  remove(slotId: UUID): Promise<JobSlotRow>;
};

/**
 * The Bay row lock is the single serialization point for a Bay Queue: every
 * sequence mutation goes through a queue obtained here, so slot rows
 * themselves are never locked for queue changes.
 */
export async function lockBayQueue(
  tx: DatabaseTransaction,
  bayId: UUID,
  options: { plantToday?: DateOnlyIso } = {},
): Promise<BayQueue> {
  const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, bayId)).for('update');

  if (!bay) {
    throw new JobBayNotFoundError(bayId);
  }

  return createBayQueue(tx, bay, options.plantToday ?? getPlantDateNow());
}

export async function lockBayQueueBySlot(tx: DatabaseTransaction, slotId: UUID): Promise<BayQueue> {
  const [slot] = await tx.select({ bayId: jobSlots.bayId }).from(jobSlots).where(eq(jobSlots.id, slotId));

  if (!slot) {
    throw new JobSlotNotFoundError(slotId);
  }

  return lockBayQueue(tx, slot.bayId);
}

function createBayQueue(tx: DatabaseTransaction, bay: JobBayRow, plantToday: DateOnlyIso): BayQueue {
  return {
    bay,

    async book(spec, options = {}) {
      assertBayAcceptsBookings(bay);

      const existingSlots = await listQueueSlots(tx, bay.id);
      const workingCalendar = await loadBayWorkingCalendar(tx, bay.id);
      const placement = resolveInsertAtDatePlacement({
        currentDate: plantToday,
        pickedDate: options.startDate,
        scheduleOrigin: DateOnlyIso.parse(bay.scheduleOrigin),
        slots: existingSlots,
        workingCalendar,
      });

      if (placement.type === 'append') {
        // A queue that ended in the past gets the gap filled with idle, so the
        // booked Slot never starts before the plant's current business day.
        const lastSlot = existingSlots.at(-1);
        let sequence = lastSlot ? lastSlot.sequence + 1 : 1;

        if (placement.idleGapDays > 0) {
          await insertSlotRow(tx, bay.id, sequence, { durationDays: placement.idleGapDays, kind: 'idle', label: null });
          sequence += 1;
        }

        return insertSlotRow(tx, bay.id, sequence, spec);
      }

      if (placement.type === 'insert-before') {
        return insertSlotRowAtSequence(tx, bay.id, placement.targetSlot.sequence, spec);
      }

      const { targetSlot } = placement;

      await tx
        .update(jobSlots)
        .set({
          sequence: sql`${jobSlots.sequence} + 2`,
          updatedAt: new Date(),
        })
        .where(and(eq(jobSlots.bayId, bay.id), gt(jobSlots.sequence, targetSlot.sequence)));
      await tx
        .update(jobSlots)
        .set({
          durationDays: placement.beforeDays,
          updatedAt: new Date(),
        })
        .where(eq(jobSlots.id, targetSlot.id));

      const slot = await insertSlotRow(tx, bay.id, targetSlot.sequence + 1, spec);
      await insertSlotRow(tx, bay.id, targetSlot.sequence + 2, secondSplitHalfSpec(targetSlot, placement.afterDays));

      return slot;
    },

    async insertRelative(targetSlotId, placement, spec) {
      const targetSlot = await getQueueSlot(tx, bay.id, targetSlotId);
      const insertionSequence = placement === 'before' ? targetSlot.sequence : targetSlot.sequence + 1;

      return insertSlotRowAtSequence(tx, bay.id, insertionSequence, spec);
    },

    async resize(slotId, durationDays) {
      const slot = await getQueueSlot(tx, bay.id, slotId);
      const [resizedSlot] = await tx
        .update(jobSlots)
        .set({
          durationDays,
          updatedAt: new Date(),
        })
        .where(eq(jobSlots.id, slot.id))
        .returning();

      if (!resizedSlot) {
        throw new Error('Job slot resize did not return a row');
      }

      return resizedSlot;
    },

    async swap(slotId, direction) {
      const slot = await getQueueSlot(tx, bay.id, slotId);
      const movingLeft = direction === 'left';
      const [adjacentSlot] = await tx
        .select()
        .from(jobSlots)
        .where(
          and(
            eq(jobSlots.bayId, bay.id),
            movingLeft ? lt(jobSlots.sequence, slot.sequence) : gt(jobSlots.sequence, slot.sequence),
          ),
        )
        .orderBy(movingLeft ? desc(jobSlots.sequence) : asc(jobSlots.sequence))
        .limit(1);

      if (!adjacentSlot) {
        return { slot, swapped: null };
      }

      const updatedAt = new Date();
      // The bay sequence unique index is deferrable, so this swap may pass through a temporary duplicate.
      const [movedSlot] = await tx
        .update(jobSlots)
        .set({
          sequence: adjacentSlot.sequence,
          updatedAt,
        })
        .where(eq(jobSlots.id, slot.id))
        .returning();

      if (!movedSlot) {
        throw new Error('Job slot move did not return a row');
      }

      const [swappedAdjacentSlot] = await tx
        .update(jobSlots)
        .set({
          sequence: slot.sequence,
          updatedAt,
        })
        .where(eq(jobSlots.id, adjacentSlot.id))
        .returning({ id: jobSlots.id });

      if (!swappedAdjacentSlot) {
        throw new Error('Adjacent job slot move did not return a row');
      }

      return {
        slot: movedSlot,
        swapped: {
          afterSlotOrder: movingLeft ? [slot.id, adjacentSlot.id] : [adjacentSlot.id, slot.id],
          beforeSlotOrder: movingLeft ? [adjacentSlot.id, slot.id] : [slot.id, adjacentSlot.id],
        },
      };
    },

    async remove(slotId) {
      const slot = await getQueueSlot(tx, bay.id, slotId);
      const [removedSlot] = await tx.delete(jobSlots).where(eq(jobSlots.id, slot.id)).returning();

      if (!removedSlot) {
        throw new Error('Job slot delete did not return a row');
      }

      await tx
        .update(jobSlots)
        .set({
          sequence: sql`${jobSlots.sequence} - 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(jobSlots.bayId, bay.id), gt(jobSlots.sequence, slot.sequence)));

      return removedSlot;
    },
  };
}

function assertBayAcceptsBookings(bay: JobBayRow): void {
  if (bay.disabledAt) {
    throw new JobSlotBookingDeniedError('This Bay is disabled and cannot accept new bookings.');
  }
}

function secondSplitHalfSpec(targetSlot: JobSlotRow, durationDays: number): BayQueueSlotSpec {
  if (targetSlot.kind === 'work') {
    if (!targetSlot.jobId) {
      throw new Error('Work slot is missing its job reference');
    }

    return { durationDays, jobId: targetSlot.jobId, kind: 'work' };
  }

  return { durationDays, kind: 'idle', label: targetSlot.label };
}

async function insertSlotRowAtSequence(
  tx: DatabaseTransaction,
  bayId: UUID,
  sequence: number,
  spec: BayQueueSlotSpec,
): Promise<JobSlotRow> {
  await tx
    .update(jobSlots)
    .set({
      sequence: sql`${jobSlots.sequence} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(jobSlots.bayId, bayId), gte(jobSlots.sequence, sequence)));

  return insertSlotRow(tx, bayId, sequence, spec);
}

function listQueueSlots(tx: DatabaseTransaction, bayId: UUID): Promise<JobSlotRow[]> {
  return tx.query.jobSlots.findMany({
    orderBy: [asc(jobSlots.sequence), asc(jobSlots.id)],
    where: eq(jobSlots.bayId, bayId),
  });
}

async function getQueueSlot(tx: DatabaseTransaction, bayId: UUID, slotId: UUID): Promise<JobSlotRow> {
  const [slot] = await tx
    .select()
    .from(jobSlots)
    .where(and(eq(jobSlots.id, slotId), eq(jobSlots.bayId, bayId)));

  if (!slot) {
    throw new JobSlotNotFoundError(slotId);
  }

  return slot;
}

async function insertSlotRow(
  tx: DatabaseTransaction,
  bayId: UUID,
  sequence: number,
  spec: BayQueueSlotSpec,
): Promise<JobSlotRow> {
  const [slot] = await tx
    .insert(jobSlots)
    .values({
      bayId,
      durationDays: spec.durationDays,
      jobId: spec.kind === 'work' ? spec.jobId : null,
      kind: spec.kind,
      label: spec.kind === 'idle' ? spec.label : null,
      sequence,
    })
    .returning();

  if (!slot) {
    throw new Error('Job slot insert did not return a row');
  }

  return slot;
}
