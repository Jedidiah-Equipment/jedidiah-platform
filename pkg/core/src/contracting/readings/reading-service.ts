import { randomUUID } from 'node:crypto';
import { type DatabaseTransaction, type Db, type StoredFile, user, withPagination } from '@pkg/db';
import {
  contractingCategories,
  contractingHourReadings,
  contractingJobs,
  contractingMachineAssignments,
  contractingMachines,
} from '@pkg/db/contracting';
import { hasPermission, validateFile } from '@pkg/domain';
import {
  assignmentState,
  type CaptureNeighbour,
  type CaptureWorld,
  captureCrossesServiceDueSoon,
  contradictingTelematics,
  effectiveServiceAlertHours,
  FUTURE_READ_AT_TOLERANCE_MS,
  formatJobNumber,
  type JobActor,
  jobReadStatuses,
  judgeCapture,
  READING_PHOTO_POLICY,
  readingExceptionTypes,
  readingVerification,
  resolveReadingAmendment,
  telematicsDisputeReason,
} from '@pkg/domain/contracting';
import { type AuthId, getNextCursor } from '@pkg/schema';
import {
  FieldReading,
  type FieldReadingPageInput,
  LatestReading,
  ReadingAmendInput,
  ReadingCaptureInput,
} from '@pkg/schema/contracting';
import { and, asc, eq, getTableColumns, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { recordAuditCreate } from '../../audit/audit-writer.js';
import { filePolicyViolation } from '../../files/file-errors.js';
import { readStoredObject, type StorageAdapter } from '../../storage/storage-adapter.js';
import { reopenPricingWithin } from '../jobs/pricing-service.js';
import { getContractingSettings } from '../settings/settings-service.js';
import { attachReadingToStint, resolveCaptureStint } from './capture-stint.js';
import {
  readingNotFound as notFound,
  type ReadingRow as Row,
  readingDescriptor,
  updateAudited,
  withHint,
} from './reading-audit.js';
import { assertAmendReadings, ReadingError, withCaptureConstraints } from './reading-errors.js';
import { type MeterMeasurement, measureMeterPhoto, type ReadMeterPhoto } from './reading-evidence.js';
import { newestFirst, oldestFirst, readingNeedsALookSql } from './reading-sql.js';
import { readingToWire } from './reading-wire.js';

const isTelematics = eq(contractingHourReadings.method, 'telematics');

export async function listReadingsByMachine({ db, machineId }: { db: Db; machineId: string }) {
  const opensStint = eq(contractingMachineAssignments.arrivalReadingId, contractingHourReadings.id);
  const rows = await db
    // A reading that closed one stint and opened the next appears once, under the Job it opened.
    .selectDistinctOn([contractingHourReadings.capturedAt, contractingHourReadings.sequence], {
      ...getTableColumns(contractingHourReadings),
      jobCode: contractingJobs.code,
    })
    .from(contractingHourReadings)
    .leftJoin(
      contractingMachineAssignments,
      or(opensStint, eq(contractingMachineAssignments.departureReadingId, contractingHourReadings.id)),
    )
    .leftJoin(contractingJobs, eq(contractingJobs.id, contractingMachineAssignments.jobId))
    .where(eq(contractingHourReadings.machineId, machineId))
    .orderBy(...newestFirst, sql`${opensStint} desc nulls last`);
  return rows.map(({ jobCode, ...row }) => ({
    ...withHint(row),
    jobNumber: jobCode === null ? null : formatJobNumber(jobCode),
  }));
}

/** A photo capture: the bytes and where they are kept. The AI checks them after the capture lands. */
export type ReadingEvidence = { storage: StorageAdapter; photoBytes: Uint8Array };
type AiVerdict = { aiValue: number | null; aiConfidence: number | null; aiVerification: Row['aiVerification'] };
const manualVerdict: AiVerdict = { aiValue: null, aiConfidence: null, aiVerification: 'not-applicable' };
/** A photo capture lands pending; `verifyCapturedReading` replaces it with the AI's verdict. */
const awaitingVerdict: AiVerdict = { aiValue: null, aiConfidence: null, aiVerification: 'pending' };

async function storeMeterPhoto({ storage, photoBytes }: ReadingEvidence): Promise<StoredFile> {
  const validation = validateFile(photoBytes, READING_PHOTO_POLICY);
  if (!validation.ok) throw filePolicyViolation(validation);
  const photo: StoredFile = {
    byteSize: validation.byteSize,
    contentType: validation.contentType,
    storageKey: `contracting/readings/${randomUUID()}`,
    updatedAt: new Date().toISOString(),
  };
  await storage.put({
    key: photo.storageKey,
    body: photoBytes,
    byteSize: photo.byteSize,
    contentType: photo.contentType,
  });
  return photo;
}

/**
 * `serviceDueSoonCrossed` is true when this capture, never a replay, took the Machine into Service Due Soon; the
 * caller decides who hears of it, once the write has committed.
 */
export type ReadingCapture = { reading: ReturnType<typeof withHint>; serviceDueSoonCrossed: boolean };

export async function captureReading({
  db,
  actor,
  input: raw,
  evidence,
  now = new Date(),
}: {
  db: Db;
  actor: JobActor;
  input: ReadingCaptureInput;
  evidence?: ReadingEvidence;
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
      row.role !== input.role ||
      row.capturedAt.getTime() !== Date.parse(input.capturedAt)
    )
      throw new ReadingError('reading.capture_id_conflict', 'This capture identifier has already been used.');
    return { reading: withHint(row), serviceDueSoonCrossed: false };
  }
  const delivered = await replay(db);
  if (delivered) return delivered;
  const photo = evidence ? await storeMeterPhoto(evidence) : null;
  try {
    const verdict = photo ? awaitingVerdict : manualVerdict;
    const result = await withCaptureConstraints(() =>
      db.transaction(async (tx): Promise<ReadingCapture> => {
        const [machine] = await tx
          .select()
          .from(contractingMachines)
          .where(eq(contractingMachines.id, input.machineId))
          .for('update');
        if (!machine) throw new ReadingError('reading.not_found', 'Machine not found.');
        const delivered = await replay(tx);
        if (delivered) return delivered;
        const stint = await resolveCaptureStint(tx, { actor, input });
        const readAt = new Date(input.capturedAt);
        const onMachine = eq(contractingHourReadings.machineId, input.machineId);
        const arrivalReadingId = input.role === 'departure' ? (stint?.stint.arrivalReadingId ?? null) : null;
        const [[latest], [previous], [next], [previousTelematics], [nextTelematics], [lastDeparture], [stintArrival]] =
          await Promise.all([
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
            input.role === 'arrival'
              ? tx
                  .select({ capturedAt: contractingHourReadings.capturedAt })
                  .from(contractingHourReadings)
                  .where(and(onMachine, eq(contractingHourReadings.role, 'departure')))
                  .orderBy(...newestFirst)
                  .limit(1)
              : [],
            arrivalReadingId
              ? tx
                  .select({ capturedAt: contractingHourReadings.capturedAt })
                  .from(contractingHourReadings)
                  .where(eq(contractingHourReadings.id, arrivalReadingId))
              : [],
          ]);
        const neighbours: Pick<CaptureWorld, 'latest' | 'previous' | 'next' | 'previousTelematics' | 'nextTelematics'> =
          {
            latest: latest ? { id: latest.id, value: latest.value } : null,
            previous: previous ? toNeighbour(previous) : null,
            next: next ? toNeighbour(next) : null,
            previousTelematics: previousTelematics ? toNeighbour(previousTelematics) : null,
            nextTelematics: nextTelematics ? toNeighbour(nextTelematics) : null,
          };
        const judgement = judgeCapture(
          {
            ...neighbours,
            stint: stint ? assignmentState(stint.stint) : null,
            stintArrivedAt: stintArrival?.capturedAt ?? null,
            lastDepartedAt: lastDeparture?.capturedAt ?? null,
            jobVerdict: stint?.jobVerdict ?? null,
            management: hasPermission(actor, 'contracting_job:work-any'),
            mayBaseline: hasPermission(actor, 'contracting_reading:capture-baseline'),
            machineRetired: machine.retiredAt !== null,
            implementValid: stint?.implementValid ?? true,
            driverValid: stint?.driverValid ?? true,
            hasPhoto: !!evidence,
            now,
            futureToleranceMs: FUTURE_READ_AT_TOLERANCE_MS,
          },
          {
            role: input.role,
            value: input.value,
            readAt,
            disputePrevious: input.disputePrevious,
            expectedPreviousId: input.expectedPreviousId,
            comment: input.comment ?? null,
          },
        );
        if (!judgement.ok) throw new ReadingError(judgement.reason, judgement.message, judgement.refused);
        const disputed = judgement.disputes !== null;
        if (disputed && latest)
          await updateAudited(tx, actorUserId, latest, {
            disputed: true,
            disputeReason: 'The next capture disputes this reading.',
          });
        const { serviceDueSoonThresholdHours } = await getContractingSettings({ db: tx });
        const [row] = await tx
          .insert(contractingHourReadings)
          .values({
            ...(input.localId ? { id: input.localId } : {}),
            machineId: input.machineId,
            role: input.role,
            value: input.value,
            capturedAt: readAt,
            capturedByUserId: actorUserId,
            method: photo ? 'photo' : 'manual',
            comment: input.comment ?? null,
            photo,
            ...verdict,
            disputed,
            disputedPreviousId: judgement.disputes,
            disputeReason: disputed ? 'The previous reading is wrong.' : null,
          })
          .returning();
        if (!row) throw new Error('Reading insert returned no row');
        await recordAuditCreate({ db: tx, actorUserId, descriptor: readingDescriptor, input: row });
        if (stint)
          await attachReadingToStint(tx, {
            ...stint,
            actor,
            machineCode: machine.code,
            input,
            readingId: row.id,
            acceptedAt: row.createdAt,
          });
        return {
          reading: withHint(row),
          serviceDueSoonCrossed: captureCrossesServiceDueSoon(neighbours, {
            newHours: row.value,
            nextServiceDueHours: machine.nextServiceDueHours,
            threshold: effectiveServiceAlertHours(machine, serviceDueSoonThresholdHours),
          }),
        };
      }),
    );
    // A replay that won the lock inside the transaction leaves this upload orphaned.
    if (photo && evidence && result.reading.photo?.storageKey !== photo.storageKey) {
      await evidence.storage.deleteObject(photo.storageKey);
    }
    return result;
  } catch (error) {
    if (photo && evidence) {
      try {
        await evidence.storage.deleteObject(photo.storageKey);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Reading failed and uploaded photo cleanup failed');
      }
    }
    throw error;
  }
}

const toNeighbour = ({ id, role, value, capturedAt, telematicsProvider }: Row): CaptureNeighbour => ({
  id,
  role,
  value,
  capturedAt,
  telematicsProvider,
});

const capturer = alias(user, 'exception_capturer');
const amender = alias(user, 'exception_amender');

export async function listReadingExceptions({ db }: { db: Db }) {
  const rows = await db
    .select({
      ...getTableColumns(contractingHourReadings),
      machineCode: contractingMachines.code,
      categoryIcon: contractingCategories.icon,
      categoryColour: contractingCategories.colour,
      capturedByName: capturer.name,
      amendedByName: amender.name,
    })
    .from(contractingHourReadings)
    .innerJoin(contractingMachines, eq(contractingMachines.id, contractingHourReadings.machineId))
    .innerJoin(contractingCategories, eq(contractingCategories.id, contractingMachines.categoryId))
    .leftJoin(capturer, eq(capturer.id, contractingHourReadings.capturedByUserId))
    .leftJoin(amender, eq(amender.id, contractingHourReadings.amendedBy))
    .where(readingNeedsALookSql(contractingHourReadings))
    .orderBy(...newestFirst);
  return rows.map((row) => ({
    ...withHint(row),
    exceptionTypes: readingExceptionTypes(row),
    photoBacked: row.photo !== null,
  }));
}
export async function amendReading({ db, actor, input: raw }: { db: Db; actor: JobActor; input: ReadingAmendInput }) {
  const actorUserId = actor.userId;
  const input = ReadingAmendInput.parse(raw);
  return db.transaction(async (tx) => {
    const owner = await tx.query.contractingHourReadings.findFirst({ where: eq(contractingHourReadings.id, input.id) });
    if (!owner) throw notFound();
    if (owner.method === 'telematics')
      throw new ReadingError('reading.invalid_amendment', 'A Telematics Reading cannot be amended.');
    const [machine] = await tx
      .select()
      .from(contractingMachines)
      .where(eq(contractingMachines.id, owner.machineId))
      .for('update');
    if (!machine) throw notFound();
    const affected = await lockJobsMovedBy(tx, owner);
    for (const job of affected) assertAmendReadings(job, actor);
    const rows = await tx
      .select()
      .from(contractingHourReadings)
      .where(eq(contractingHourReadings.machineId, owner.machineId))
      .orderBy(...oldestFirst);
    const resolution = resolveReadingAmendment(rows, input);
    if (!resolution.ok) {
      if (resolution.reason === 'not_found') throw notFound();
      throw new ReadingError('reading.invalid_amendment', 'Amended hours must be between the neighbouring readings.');
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    const afterAmendment = rows.map((row) => (row.id === input.id ? { ...row, value: input.value } : row));
    for (const { id, ...settled } of resolution.changes) {
      const before = byId.get(id);
      if (!before) continue;
      // A pair settling must not clear a reading a Telematics Reading still contradicts.
      const reported = settled.disputed ? null : contradictingTelematics(afterAmendment, id);
      const dispute = reported
        ? { ...settled, disputed: true, disputeReason: telematicsDisputeReason(reported) }
        : settled;
      const now = new Date();
      await updateAudited(tx, actorUserId, before, {
        ...dispute,
        ...(id === input.id
          ? {
              value: input.value,
              aiVerification: before.photo
                ? readingVerification(input.value, before.aiValue, before.aiConfidence)
                : 'not-applicable',
              amendedBy: actorUserId,
              amendedAt: now,
              amendmentReason: input.reason,
              evidenceReviewedAt: now,
            }
          : {}),
      });
    }
    for (const job of affected.filter((candidate) => candidate.status === 'priced'))
      await reopenPricingWithin(
        tx,
        actorUserId,
        job.id,
        `Hour Reading amended on ${machine.code} — amounts recomputed.`,
      );
    return getReading({ db: tx, id: input.id });
  });
}

/**
 * The Jobs whose derived hours an amendment of this reading moves, locked after the machine: the stint
 * the reading bounds, and — for a departure — the machine's next stint, whose Hour Gap starts at this
 * value and which may be on another Job.
 */
async function lockJobsMovedBy(tx: DatabaseTransaction, reading: Row) {
  const bounded = await tx
    .select({ jobId: contractingMachineAssignments.jobId })
    .from(contractingMachineAssignments)
    .where(
      or(
        eq(contractingMachineAssignments.arrivalReadingId, reading.id),
        eq(contractingMachineAssignments.departureReadingId, reading.id),
      ),
    );
  const next =
    reading.role === 'departure'
      ? await tx
          .select({ jobId: contractingMachineAssignments.jobId })
          .from(contractingMachineAssignments)
          .innerJoin(
            contractingHourReadings,
            eq(contractingHourReadings.id, contractingMachineAssignments.arrivalReadingId),
          )
          .where(
            and(
              eq(contractingHourReadings.machineId, reading.machineId),
              or(
                gt(contractingHourReadings.capturedAt, reading.capturedAt),
                and(
                  eq(contractingHourReadings.capturedAt, reading.capturedAt),
                  gt(contractingHourReadings.sequence, reading.sequence),
                ),
              ),
            ),
          )
          .orderBy(...oldestFirst)
          .limit(1)
      : [];
  const jobIds = [...new Set([...bounded, ...next].map((row) => row.jobId))];
  if (!jobIds.length) return [];
  return tx
    .select({ id: contractingJobs.id, status: contractingJobs.status, foremanUserId: contractingJobs.foremanUserId })
    .from(contractingJobs)
    .where(inArray(contractingJobs.id, jobIds))
    .orderBy(asc(contractingJobs.id))
    .for('update');
}

export async function getReading({ db, id }: { db: Db | DatabaseTransaction; id: string }) {
  const row = await db.query.contractingHourReadings.findFirst({ where: eq(contractingHourReadings.id, id) });
  if (!row) throw notFound();
  return withHint(row);
}

/** The reading whose evidence this person may open: fleet readers any, a Foreman only those on his readable Jobs. */
export async function getReadingForEvidence({ db, actor, id }: { db: Db; actor: JobActor; id: string }) {
  if (hasPermission(actor, 'contracting_machine:read')) return getReading({ db, id });
  const ownJobReading =
    hasPermission(actor, 'contracting_job:read-own') &&
    (await readingBelongsToForemanJob({ db, id, foremanUserId: actor.userId }));
  if (!ownJobReading) throw new ReadingError('reading.forbidden', 'You cannot view Hour Reading evidence.');
  return getReading({ db, id });
}

/** Scope a field user's evidence read to readings attached to one of their visible Jobs. */
async function readingBelongsToForemanJob({
  db,
  id,
  foremanUserId,
}: {
  db: Db;
  id: string;
  foremanUserId: AuthId;
}): Promise<boolean> {
  const [assignment] = await db
    .select({ id: contractingMachineAssignments.id })
    .from(contractingMachineAssignments)
    .innerJoin(contractingJobs, eq(contractingJobs.id, contractingMachineAssignments.jobId))
    .where(
      and(
        eq(contractingJobs.foremanUserId, foremanUserId),
        inArray(contractingJobs.status, jobReadStatuses.own),
        or(
          eq(contractingMachineAssignments.arrivalReadingId, id),
          eq(contractingMachineAssignments.departureReadingId, id),
        ),
      ),
    )
    .limit(1);
  return !!assignment;
}
async function measureStoredPhoto(storage: StorageAdapter, photo: StoredFile, readPhoto: ReadMeterPhoto) {
  const stored = await readStoredObject(storage, photo.storageKey);
  return measureMeterPhoto(stored.bytes, stored.contentType, readPhoto);
}

const verificationFailed = () =>
  new ReadingError(
    'reading.verification_failed',
    'AI verification failed. Previous evidence has been kept; try again.',
  );

/**
 * Lands the AI's measurement under the Machine's lock, judged against the reading's value as it stands then, so an
 * amendment made while the AI was reading is respected. A fresh verdict reopens the evidence for review, even one
 * reviewed before the AI had looked. With `onlyIfPendingOn`, it lands only while the reading still awaits a check on
 * that photo.
 */
async function recordVerdict(
  db: Db,
  reading: Row,
  measurement: MeterMeasurement,
  actorUserId: AuthId | null,
  onlyIfPendingOn?: string,
) {
  return db.transaction(async (tx) => {
    await tx.select().from(contractingMachines).where(eq(contractingMachines.id, reading.machineId)).for('update');
    const before = await getReading({ db: tx, id: reading.id });
    const stale =
      onlyIfPendingOn !== undefined &&
      (before.aiVerification !== 'pending' || before.photo?.storageKey !== onlyIfPendingOn);
    if (stale) return before;
    return updateAudited(tx, actorUserId, before, {
      ...measurement,
      evidenceReviewedAt: null,
      aiVerification: readingVerification(before.value, measurement.aiValue, measurement.aiConfidence),
    });
  });
}

/**
 * Checks a just-captured reading's photo and records the AI's verdict, as the System. It runs after the capture has
 * answered, so the person capturing never waits on the AI, and a re-verify in the meantime wins. A failed check
 * throws for the caller to log and leaves the reading pending, for Re-verify or the next start-up to finish.
 */
export async function verifyCapturedReading({
  db,
  id,
  storage,
  readPhoto,
}: {
  db: Db;
  id: string;
  storage: StorageAdapter;
  readPhoto: ReadMeterPhoto;
}) {
  const captured = await getReading({ db, id });
  if (!captured.photo || captured.aiVerification !== 'pending') return captured;
  const measurement = await measureStoredPhoto(storage, captured.photo, readPhoto);
  if (!measurement) throw verificationFailed();
  return recordVerdict(db, captured, measurement, null, captured.photo.storageKey);
}

/** Photo readings still waiting on their AI check, such as those a restart interrupted. */
export async function listReadingsAwaitingVerification({ db }: { db: Db }) {
  const rows = await db
    .select({ id: contractingHourReadings.id })
    .from(contractingHourReadings)
    .where(eq(contractingHourReadings.aiVerification, 'pending'))
    .orderBy(contractingHourReadings.sequence);
  return rows.map((row) => row.id);
}

export async function reverifyReading({
  db,
  actorUserId,
  id,
  storage,
  readPhoto,
}: {
  db: Db;
  actorUserId: AuthId;
  id: string;
  storage: StorageAdapter;
  readPhoto: ReadMeterPhoto;
}) {
  const owner = await getReading({ db, id });
  if (!owner.photo) throw new ReadingError('reading.no_photo', 'This reading has Missing Photo Evidence.');
  const measurement = await measureStoredPhoto(storage, owner.photo, readPhoto);
  if (!measurement) throw verificationFailed();
  return recordVerdict(db, owner, measurement, actorUserId);
}

/** The Machine's latest reading by Read At, the one a dispute names; null while the ledger is empty. */
export async function latestReading({ db, machineId }: { db: Db; machineId: string }) {
  const [row] = await db
    .select()
    .from(contractingHourReadings)
    .where(eq(contractingHourReadings.machineId, machineId))
    .orderBy(...newestFirst)
    .limit(1);
  return row ? LatestReading.parse(readingToWire(row)) : null;
}

/** A page of a Machine's Hour Readings, newest first. */
export async function listFieldReadingsPage({ db, input }: { db: Db; input: FieldReadingPageInput }) {
  const onMachine = eq(contractingHourReadings.machineId, input.machineId);
  const query = db
    .select()
    .from(contractingHourReadings)
    .where(onMachine)
    .orderBy(...newestFirst)
    .$dynamic();
  const [rows, total] = await Promise.all([
    withPagination(query, input),
    db.$count(contractingHourReadings, onMachine),
  ]);
  return {
    items: rows.map((row) => FieldReading.parse(readingToWire(row))),
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  };
}
