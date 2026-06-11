import { type DatabaseTransaction, jobBays, jobSlots } from '@pkg/db';
import { countWorkingDaysBetween, projectJobSlots } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { and, asc, desc, eq, gt, gte, lt, sql } from 'drizzle-orm';

import { JobBayNotFoundError, JobSlotBookingDeniedError, JobSlotNotFoundError } from './job-errors.js';
import {
  createBayWorkingCalendar,
  createOrgWorkingCalendar,
  listBayCalendarExceptions,
  listWorkingCalendarOffDays,
} from './job-read-service.js';

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
  append(spec: BayQueueSlotSpec, options: { currentDate: Date }): Promise<JobSlotRow>;
  insertRelative(targetSlotId: UUID, placement: 'before' | 'after', spec: BayQueueSlotSpec): Promise<JobSlotRow>;
  swap(slotId: UUID, direction: 'left' | 'right'): Promise<BayQueueSwapResult>;
  remove(slotId: UUID): Promise<JobSlotRow>;
};

/**
 * The Bay row lock is the single serialization point for a Bay Queue: every
 * sequence mutation goes through a queue obtained here, so slot rows
 * themselves are never locked for queue changes.
 */
export async function lockBayQueue(tx: DatabaseTransaction, bayId: UUID): Promise<BayQueue> {
  const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, bayId)).for('update');

  if (!bay) {
    throw new JobBayNotFoundError(bayId);
  }

  return createBayQueue(tx, bay);
}

export async function lockBayQueueBySlot(tx: DatabaseTransaction, slotId: UUID): Promise<BayQueue> {
  const [slot] = await tx.select({ bayId: jobSlots.bayId }).from(jobSlots).where(eq(jobSlots.id, slotId));

  if (!slot) {
    throw new JobSlotNotFoundError(slotId);
  }

  return lockBayQueue(tx, slot.bayId);
}

function createBayQueue(tx: DatabaseTransaction, bay: JobBayRow): BayQueue {
  return {
    bay,

    async append(spec, { currentDate }) {
      if (bay.disabledAt) {
        throw new JobSlotBookingDeniedError('This Bay is disabled and cannot accept new bookings.');
      }

      const existingSlots = await listQueueSlots(tx, bay.id);
      const lastSlot = existingSlots.at(-1);
      let sequence = lastSlot ? lastSlot.sequence + 1 : 1;

      const workingCalendar = createBayWorkingCalendar(
        createOrgWorkingCalendar(await listWorkingCalendarOffDays(tx)),
        await listBayCalendarExceptions(tx, bay.id),
      );
      const projection = projectJobSlots({
        scheduleOrigin: bay.scheduleOrigin,
        slots: existingSlots,
        workingCalendar,
      });
      const gapDays = countWorkingDaysBetween(projection.nextAvailableAt, currentDate, workingCalendar);

      if (gapDays > 0) {
        await insertSlotRow(tx, bay.id, sequence, { durationDays: gapDays, kind: 'idle', label: null });
        sequence += 1;
      }

      return insertSlotRow(tx, bay.id, sequence, spec);
    },

    async insertRelative(targetSlotId, placement, spec) {
      const targetSlot = await getQueueSlot(tx, bay.id, targetSlotId);
      const insertionSequence = placement === 'before' ? targetSlot.sequence : targetSlot.sequence + 1;
      const shiftCondition =
        placement === 'before'
          ? gte(jobSlots.sequence, targetSlot.sequence)
          : gt(jobSlots.sequence, targetSlot.sequence);

      await tx
        .update(jobSlots)
        .set({
          sequence: sql`${jobSlots.sequence} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(jobSlots.bayId, bay.id), shiftCondition));

      return insertSlotRow(tx, bay.id, insertionSequence, spec);
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
