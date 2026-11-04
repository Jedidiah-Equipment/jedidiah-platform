import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingHourReadings, contractingMachines } from '@pkg/db/contracting';
import {
  type CaptureNeighbour,
  type CaptureWorld,
  type EstimateFacts,
  estimateReadAt,
  FUTURE_READ_AT_TOLERANCE_MS,
  isReported,
  type JobActor,
  judgeCapture,
  namesReadAt,
  proposesReadAt,
  resolveReadingAmendment,
} from '@pkg/domain/contracting';
import {
  LatestReading,
  ReadAtEstimate,
  ReadAtEstimateInput,
  ReadingAmendInput,
  ReadingCaptureInput,
  ReadingDeleteInput,
} from '@pkg/schema/contracting';
import { and, eq, gt, lte } from 'drizzle-orm';
import { recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { serviceDueSoonEdge } from '../fleet/machine-service.js';
import { type ReadingRow as Row, readingDescriptor, updateAudited } from './reading-audit.js';
import { amendmentRefused, readingNotFound as notFound, ReadingError } from './reading-errors.js';
import { afterInLedger, newestFirst, oldestFirst } from './reading-sql.js';
import { readingToWire } from './reading-wire.js';

const isTelematics = eq(contractingHourReadings.method, 'telematics');

/** A Machine's ledger, newest Read At first. */
export async function listReadingsByMachine({ db, machineId }: { db: Db; machineId: string }) {
  return db
    .select()
    .from(contractingHourReadings)
    .where(eq(contractingHourReadings.machineId, machineId))
    .orderBy(...newestFirst);
}

/**
 * `serviceDueSoonCrossed` is true when this capture, never a replay, took the Machine into Service Due Soon; the
 * caller decides who hears of it, once the write has committed.
 */
export type ReadingCapture = { reading: Row; serviceDueSoonCrossed: boolean };

export async function captureReading({
  db,
  actor,
  input: raw,
  now = new Date(),
}: {
  db: Db;
  actor: JobActor;
  input: ReadingCaptureInput;
  now?: Date;
}): Promise<ReadingCapture> {
  const actorUserId = actor.userId;
  const input = ReadingCaptureInput.parse(raw);
  // A mobile retry of an already delivered capture returns the stored row instead of a duplicate.
  async function replay(db: Db | DatabaseTransaction): Promise<ReadingCapture | null> {
    if (!input.localId) return null;
    const row = await db.query.contractingHourReadings.findFirst({
      where: eq(contractingHourReadings.id, input.localId),
    });
    if (!row) return null;
    if (
      row.capturedByUserId !== actorUserId ||
      row.machineId !== input.machineId ||
      row.capturedAt.getTime() !== Date.parse(input.capturedAt)
    )
      throw new ReadingError('reading.capture_id_conflict', 'This capture identifier has already been used.');
    return { reading: row, serviceDueSoonCrossed: false };
  }
  const delivered = await replay(db);
  if (delivered) return delivered;
  return db.transaction(async (tx): Promise<ReadingCapture> => {
    const [machine] = await tx
      .select()
      .from(contractingMachines)
      .where(eq(contractingMachines.id, input.machineId))
      .for('update');
    if (!machine) throw new ReadingError('reading.not_found', 'Machine not found.');
    const delivered = await replay(tx);
    if (delivered) return delivered;
    const readAt = new Date(input.capturedAt);
    const onMachine = eq(contractingHourReadings.machineId, input.machineId);
    const [[latest], [previous], [next], [previousTelematics], [nextTelematics], edge] = await Promise.all([
      tx
        .select()
        .from(contractingHourReadings)
        .where(onMachine)
        .orderBy(...newestFirst)
        .limit(1),
      tx
        .select()
        .from(contractingHourReadings)
        .where(and(onMachine, lte(contractingHourReadings.capturedAt, readAt)))
        .orderBy(...newestFirst)
        .limit(1),
      tx
        .select()
        .from(contractingHourReadings)
        .where(and(onMachine, gt(contractingHourReadings.capturedAt, readAt)))
        .orderBy(...oldestFirst)
        .limit(1),
      tx
        .select()
        .from(contractingHourReadings)
        .where(and(onMachine, isTelematics, lte(contractingHourReadings.capturedAt, readAt)))
        .orderBy(...newestFirst)
        .limit(1),
      tx
        .select()
        .from(contractingHourReadings)
        .where(and(onMachine, isTelematics, gt(contractingHourReadings.capturedAt, readAt)))
        .orderBy(...oldestFirst)
        .limit(1),
      serviceDueSoonEdge(tx, machine),
    ]);
    const world: CaptureWorld = {
      latest: latest ? { id: latest.id, value: latest.value } : null,
      previous: previous ? toNeighbour(previous) : null,
      next: next ? toNeighbour(next) : null,
      previousTelematics: previousTelematics ? toNeighbour(previousTelematics) : null,
      nextTelematics: nextTelematics ? toNeighbour(nextTelematics) : null,
      machineRetired: machine.retiredAt !== null,
      now,
      futureToleranceMs: FUTURE_READ_AT_TOLERANCE_MS,
    };
    const judgement = judgeCapture(world, { value: input.value, readAt });
    if (!judgement.ok) {
      // Only a value refusal proposes a Read At, so only one reads the readings bracketing the value.
      const estimate = proposesReadAt(judgement.rule)
        ? estimateReadAt(input.value, {
            ...(await estimateFacts(tx, input, latest ? toNeighbour(latest) : null)),
            now,
          })
        : null;
      throw new ReadingError(judgement.reason, judgement.message, {
        suggestedReadAt: estimate && namesReadAt(estimate) ? ReadAtEstimate.parse(estimate) : undefined,
      });
    }
    const [row] = await tx
      .insert(contractingHourReadings)
      .values({
        ...(input.localId ? { id: input.localId } : {}),
        machineId: input.machineId,
        value: input.value,
        capturedAt: readAt,
        capturedByUserId: actorUserId,
        method: 'manual',
        comment: input.comment ?? null,
      })
      .returning();
    if (!row) throw new Error('Reading insert returned no row');
    await recordAuditCreate({ db: tx, actorUserId, descriptor: readingDescriptor, input: row });
    return { reading: row, serviceDueSoonCrossed: await edge.crossed() };
  });
}

/** When the ledger says `value` was on the Machine's meter, as the capture form asks before it posts. */
export async function estimateReadAtFor({
  db,
  input: raw,
  now = new Date(),
}: {
  db: Db | DatabaseTransaction;
  input: ReadAtEstimateInput;
  now?: Date;
}): Promise<ReadAtEstimate> {
  const input = ReadAtEstimateInput.parse(raw);
  return ReadAtEstimate.parse(estimateReadAt(input.value, { ...(await estimateFacts(db, input)), now }));
}

/**
 * What the estimate reads for one value: the latest, and the last reading at or below the value with the first after
 * it. A capture under the lock already holds the latest.
 */
async function estimateFacts(
  db: Db | DatabaseTransaction,
  input: Pick<ReadingCaptureInput, 'machineId' | 'value'>,
  known?: EstimateFacts['latest'],
): Promise<Omit<EstimateFacts, 'now'>> {
  const onMachine = eq(contractingHourReadings.machineId, input.machineId);
  const [[latest], [floor]] = await Promise.all([
    known !== undefined
      ? []
      : db
          .select()
          .from(contractingHourReadings)
          .where(onMachine)
          .orderBy(...newestFirst)
          .limit(1),
    db
      .select()
      .from(contractingHourReadings)
      .where(and(onMachine, lte(contractingHourReadings.value, input.value)))
      .orderBy(...newestFirst)
      .limit(1),
  ]);
  const [ceiling] =
    floor && floor.value !== input.value
      ? await db
          .select()
          .from(contractingHourReadings)
          .where(and(onMachine, afterInLedger(floor)))
          .orderBy(...oldestFirst)
          .limit(1)
      : [];
  return {
    latest: known !== undefined ? known : latest ? toNeighbour(latest) : null,
    floor: floor ? toEstimateNeighbour(floor) : null,
    ceiling: ceiling ? toEstimateNeighbour(ceiling) : null,
  };
}

const toEstimateNeighbour = (row: Row) => ({ ...toNeighbour(row), createdAt: row.createdAt });

const toNeighbour = ({ id, value, capturedAt, telematicsProvider }: Row): CaptureNeighbour => ({
  id,
  value,
  capturedAt,
  telematicsProvider,
});

/** Locks the Machine a reading is on, serializing every amendment and deletion with its captures. */
async function lockMachineOf(tx: DatabaseTransaction, id: string) {
  const [target] = await tx
    .select({ machineId: contractingHourReadings.machineId })
    .from(contractingHourReadings)
    .where(eq(contractingHourReadings.id, id));
  if (!target) throw notFound();
  await tx
    .select({ id: contractingMachines.id })
    .from(contractingMachines)
    .where(eq(contractingMachines.id, target.machineId))
    .for('update');
  return target.machineId;
}

/** A spot reading as read under its Machine lock; a Telematics Reading is John Deere's, never anyone's to change. */
function spotReadingFor(row: Row | undefined, change: 'amended' | 'deleted'): Row {
  if (!row) throw notFound();
  if (isReported(row)) throw new ReadingError('reading.telematics', `A Telematics Reading cannot be ${change}.`);
  return row;
}

/** Corrects a spot reading's hours or Read At, judged again at its new place in time. */
export async function amendReading({ db, actor, input: raw }: { db: Db; actor: JobActor; input: ReadingAmendInput }) {
  const input = ReadingAmendInput.parse(raw);
  const change = { value: input.value, capturedAt: new Date(input.capturedAt) };
  return db.transaction(async (tx) => {
    const machineId = await lockMachineOf(tx, input.id);
    const ledger = await tx
      .select()
      .from(contractingHourReadings)
      .where(eq(contractingHourReadings.machineId, machineId));
    const before = spotReadingFor(
      ledger.find((row) => row.id === input.id),
      'amended',
    );
    const now = new Date();
    const resolution = resolveReadingAmendment(ledger, before, change, now);
    if (!resolution.ok) throw amendmentRefused(resolution);
    return updateAudited(tx, actor.userId, before, { ...change, amendedBy: actor.userId, amendedAt: now });
  });
}

/** Takes a spot reading off the ledger, such as one captured by accident; the Audit Log keeps what it said. */
export async function deleteReading({ db, actor, input: raw }: { db: Db; actor: JobActor; input: ReadingDeleteInput }) {
  const input = ReadingDeleteInput.parse(raw);
  await db.transaction(async (tx) => {
    await lockMachineOf(tx, input.id);
    const row = spotReadingFor(
      await tx.query.contractingHourReadings.findFirst({ where: eq(contractingHourReadings.id, input.id) }),
      'deleted',
    );
    await tx.delete(contractingHourReadings).where(eq(contractingHourReadings.id, row.id));
    await recordAuditDelete({ db: tx, actorUserId: actor.userId, descriptor: readingDescriptor, input: row });
  });
}

export async function getReading({ db, id }: { db: Db | DatabaseTransaction; id: string }) {
  const row = await db.query.contractingHourReadings.findFirst({ where: eq(contractingHourReadings.id, id) });
  if (!row) throw notFound();
  return row;
}

/** The Machine's latest ledger reading by Read At, the floor a spot capture is held to; null while the ledger is empty. */
export async function latestReading({ db, machineId }: { db: Db; machineId: string }) {
  const [row] = await db
    .select()
    .from(contractingHourReadings)
    .where(eq(contractingHourReadings.machineId, machineId))
    .orderBy(...newestFirst)
    .limit(1);
  return row ? LatestReading.parse(readingToWire(row)) : null;
}
