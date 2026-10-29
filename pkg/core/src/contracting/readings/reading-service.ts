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
  amendedLedger,
  assignmentState,
  type CaptureNeighbour,
  type CaptureWorld,
  captureCrossesServiceDueSoon,
  effectiveServiceAlertHours,
  FUTURE_READ_AT_TOLERANCE_MS,
  type JobActor,
  jobReadStatuses,
  judgeCapture,
  READING_PHOTO_POLICY,
  readingExceptionTypes,
  readingVerification,
  resolveReadingAmendments,
} from '@pkg/domain/contracting';
import { type AuthId, getNextCursor } from '@pkg/schema';
import {
  FieldReading,
  type FieldReadingPageInput,
  LatestReading,
  ReadingAmendInput,
  ReadingCaptureInput,
} from '@pkg/schema/contracting';
import { and, asc, eq, getTableColumns, gt, inArray, isNotNull, lte, or } from 'drizzle-orm';
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
import { amendmentRefused, assertAmendReadings, ReadingError, withCaptureConstraints } from './reading-errors.js';
import { type MeterMeasurement, measureMeterPhoto, type ReadMeterPhoto } from './reading-evidence.js';
import { newestFirst, oldestFirst, readingNeedsALookSql } from './reading-sql.js';
import { readingToWire } from './reading-wire.js';

const isTelematics = eq(contractingHourReadings.method, 'telematics');

/** A Machine's ledger, newest Read At first. */
export async function listReadingsByMachine({ db, machineId }: { db: Db; machineId: string }) {
  const rows = await db
    .select()
    .from(contractingHourReadings)
    .where(eq(contractingHourReadings.machineId, machineId))
    .orderBy(...newestFirst);
  return rows.map((row) => withHint(row));
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
export async function amendReadings({ db, actor, input: raw }: { db: Db; actor: JobActor; input: ReadingAmendInput }) {
  const actorUserId = actor.userId;
  const input = ReadingAmendInput.parse(raw);
  const amendments = input.amendments.map((amendment) => ({
    ...amendment,
    capturedAt: new Date(amendment.capturedAt),
  }));
  const ids = new Set(amendments.map((amendment) => amendment.id));
  if (ids.size !== amendments.length) throw new ReadingError('reading.invalid_amendment', 'Amend each reading once.');
  return db.transaction(async (tx) => {
    const targets = await tx
      .select()
      .from(contractingHourReadings)
      .where(inArray(contractingHourReadings.id, [...ids]));
    if (targets.length !== ids.size) throw notFound();
    if (targets.some((row) => row.method === 'telematics'))
      throw new ReadingError('reading.invalid_amendment', 'A Telematics Reading cannot be amended.');
    const machineIds = new Set(targets.map((row) => row.machineId));
    const [machineId] = machineIds;
    if (machineIds.size !== 1 || !machineId)
      throw new ReadingError('reading.invalid_amendment', 'Amend one Machine at a time.');
    const [machine] = await tx
      .select()
      .from(contractingMachines)
      .where(eq(contractingMachines.id, machineId))
      .for('update');
    if (!machine) throw notFound();
    const [rows, stints] = await Promise.all([
      tx
        .select()
        .from(contractingHourReadings)
        .where(eq(contractingHourReadings.machineId, machineId))
        .orderBy(...oldestFirst),
      stintsOf(tx, machineId),
    ]);
    const affected = await lockJobsMovedBy(tx, { ledgers: [rows, amendedLedger(rows, amendments)], stints, ids });
    for (const job of affected) assertAmendReadings(job, actor);
    const resolution = resolveReadingAmendments(rows, amendments, stints, new Date());
    if (!resolution.ok) throw amendmentRefused(resolution);
    const now = new Date();
    const before = new Map(rows.map((row) => [row.id, row]));
    const amendmentOf = new Map(amendments.map((amendment) => [amendment.id, amendment]));
    for (const { id, ...dispute } of resolution.changes) {
      const row = before.get(id);
      if (!row) continue;
      const amendment = amendmentOf.get(id);
      await updateAudited(tx, actorUserId, row, {
        ...dispute,
        ...(amendment
          ? {
              value: amendment.value,
              capturedAt: amendment.capturedAt,
              aiVerification: row.photo
                ? readingVerification(amendment.value, row.aiValue, row.aiConfidence)
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
    const amended = await tx
      .select()
      .from(contractingHourReadings)
      .where(inArray(contractingHourReadings.id, [...ids]));
    const byId = new Map(amended.map((row) => [row.id, withHint(row)]));
    return [...ids].flatMap((id) => byId.get(id) ?? []);
  });
}

/** A Machine's stints with an arrival, as the readings bound them, with the Job each belongs to. */
async function stintsOf(tx: DatabaseTransaction, machineId: string) {
  const rows = await tx
    .select({
      assignmentId: contractingMachineAssignments.id,
      jobId: contractingMachineAssignments.jobId,
      arrivalId: contractingMachineAssignments.arrivalReadingId,
      departureId: contractingMachineAssignments.departureReadingId,
    })
    .from(contractingMachineAssignments)
    .where(
      and(
        eq(contractingMachineAssignments.machineId, machineId),
        isNotNull(contractingMachineAssignments.arrivalReadingId),
      ),
    );
  return rows.flatMap(({ arrivalId, ...stint }) => (arrivalId ? [{ ...stint, arrivalId }] : []));
}

/**
 * The Jobs whose derived hours amending these readings moves, locked after the Machine: each stint a reading bounds,
 * and for a departure the Machine's next stint, whose Hour Gap starts at it and which may be on another Job, found in
 * each of `ledgers` (as it stands and as the amendments leave it) since a re-dated departure can change which it is.
 */
async function lockJobsMovedBy(
  tx: DatabaseTransaction,
  {
    ledgers,
    stints,
    ids,
  }: { ledgers: readonly Row[][]; stints: Awaited<ReturnType<typeof stintsOf>>; ids: ReadonlySet<string> },
) {
  const jobOfArrival = new Map(stints.map((stint) => [stint.arrivalId, stint.jobId]));
  const jobIds = new Set(
    stints
      .filter((stint) => ids.has(stint.arrivalId) || (stint.departureId !== null && ids.has(stint.departureId)))
      .map((stint) => stint.jobId),
  );
  for (const ledger of ledgers)
    for (const [index, reading] of ledger.entries()) {
      if (reading.role !== 'departure' || !ids.has(reading.id)) continue;
      const nextArrival = ledger.slice(index + 1).find((candidate) => jobOfArrival.has(candidate.id));
      const jobId = nextArrival && jobOfArrival.get(nextArrival.id);
      if (jobId) jobIds.add(jobId);
    }
  if (!jobIds.size) return [];
  return tx
    .select({ id: contractingJobs.id, status: contractingJobs.status, foremanUserId: contractingJobs.foremanUserId })
    .from(contractingJobs)
    .where(inArray(contractingJobs.id, [...jobIds]))
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
