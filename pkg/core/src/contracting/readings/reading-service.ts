import { randomUUID } from 'node:crypto';
import { type DatabaseTransaction, type Db, type StoredFile, user } from '@pkg/db';
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
  FUTURE_READ_AT_TOLERANCE_MS,
  isFutureReadAt,
  type JobActor,
  jobReadStatuses,
  judgeCapture,
  meterDisagreementHint,
  READING_PHOTO_POLICY,
  readingExceptionTypes,
  readingVerification,
  resolveReadingAmendment,
} from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import { FieldReading, ReadingAmendInput, ReadingCaptureInput } from '@pkg/schema/contracting';
import { and, asc, desc, eq, getTableColumns, gt, inArray, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { FilePolicyViolationError } from '../../files/file-errors.js';
import { readStoredObject, type StorageAdapter } from '../../storage/storage-adapter.js';
import { reopenPricingWithin } from '../jobs/pricing-service.js';
import { attachReadingToStint, resolveCaptureStint } from './capture-stint.js';
import { assertReadingJobAction, captureRefused, ReadingError, withCaptureConstraints } from './reading-errors.js';
import { type ReadMeterPhoto, verifyPhoto } from './reading-evidence.js';
import { readingNeedsALookSql } from './reading-sql.js';
import { readingToWire } from './reading-wire.js';

const notFound = () => new ReadingError('reading.not_found', 'Hour Reading not found.');
type Row = typeof contractingHourReadings.$inferSelect;

function withHint<T extends Row>(row: T) {
  return { ...row, aiHint: meterDisagreementHint(row) };
}
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_reading',
  noun: 'Hour Reading',
  primaryLabelField: 'id',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    ...row,
    capturedAt: row.capturedAt.toISOString(),
    amendedAt: row.amendedAt?.toISOString() ?? null,
    evidenceReviewedAt: row.evidenceReviewedAt?.toISOString() ?? null,
  }),
});
export async function listReadingsByMachine({ db, machineId }: { db: Db; machineId: string }) {
  const rows = await db
    .select()
    .from(contractingHourReadings)
    .where(eq(contractingHourReadings.machineId, machineId))
    .orderBy(desc(contractingHourReadings.sequence));
  return rows.map(withHint);
}

/** A photo capture: the bytes and where they are kept. The AI checks them after the capture lands. */
export type ReadingEvidence = { storage: StorageAdapter; photoBytes: Uint8Array };
type AiVerdict = { aiValue: number | null; aiConfidence: number | null; aiVerification: Row['aiVerification'] };
const manualVerdict: AiVerdict = { aiValue: null, aiConfidence: null, aiVerification: 'not-applicable' };
/** A photo capture lands pending; `verifyCapturedReading` replaces it with the AI's verdict. */
const awaitingVerdict: AiVerdict = { aiValue: null, aiConfidence: null, aiVerification: 'pending' };

async function storeMeterPhoto({ storage, photoBytes }: ReadingEvidence): Promise<StoredFile> {
  const validation = validateFile(photoBytes, READING_PHOTO_POLICY);
  if (!validation.ok) throw new FilePolicyViolationError(validation);
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
}) {
  const actorUserId = actor.userId;
  const input = ReadingCaptureInput.parse(raw);
  if (input.role === 'baseline' && !hasPermission(actor, 'contracting_reading:capture-baseline'))
    throw new ReadingError('reading.forbidden', 'Only a Contracting administrator can capture a Baseline Reading.');
  // A mobile retry of an already delivered capture returns the stored row instead of a duplicate.
  async function replay(db: Db | DatabaseTransaction) {
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
    return withHint(row);
  }
  const delivered = await replay(db);
  if (delivered) return delivered;
  if (isFutureReadAt(new Date(input.capturedAt), now, FUTURE_READ_AT_TOLERANCE_MS))
    throw captureRefused('future-read-at');
  const photo = evidence ? await storeMeterPhoto(evidence) : null;
  try {
    const verdict = photo ? awaitingVerdict : manualVerdict;
    const result = await withCaptureConstraints(() =>
      db.transaction(async (tx) => {
        const [machine] = await tx
          .select()
          .from(contractingMachines)
          .where(eq(contractingMachines.id, input.machineId))
          .for('update');
        if (!machine) throw new ReadingError('reading.not_found', 'Machine not found.');
        const delivered = await replay(tx);
        if (delivered) return delivered;
        if (machine.retiredAt)
          throw new ReadingError('reading.retired_machine', 'Cannot capture readings for a retired Machine.');
        const stint = await resolveCaptureStint(tx, { actor, input });
        const [latest] = await tx
          .select()
          .from(contractingHourReadings)
          .where(eq(contractingHourReadings.machineId, input.machineId))
          .orderBy(desc(contractingHourReadings.sequence))
          .limit(1);
        const judgement = judgeCapture(
          {
            latest: latest ? { id: latest.id, value: latest.value } : null,
            stint: stint ? assignmentState(stint.stint) : null,
            management: hasPermission(actor, 'contracting_job:work-any'),
            hasPhoto: !!evidence,
          },
          {
            role: input.role,
            value: input.value,
            disputePrevious: input.disputePrevious,
            expectedPreviousId: input.expectedPreviousId,
            comment: input.comment ?? null,
          },
        );
        if (!judgement.ok) throw new ReadingError(judgement.reason, judgement.message);
        if (input.role === 'baseline' && latest)
          throw new ReadingError('reading.baseline_exists', 'A Baseline Reading must be the first reading.');
        const disputed = judgement.disputes !== null;
        if (disputed && latest)
          await updateAudited(tx, actorUserId, latest, {
            disputed: true,
            disputeReason: 'The next capture disputes this reading.',
          });
        const [row] = await tx
          .insert(contractingHourReadings)
          .values({
            ...(input.localId ? { id: input.localId } : {}),
            machineId: input.machineId,
            role: input.role,
            value: input.value,
            capturedAt: new Date(input.capturedAt),
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
        await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
        if (stint)
          await attachReadingToStint(tx, {
            ...stint,
            actor,
            machineCode: machine.code,
            input,
            readingId: row.id,
          });
        return withHint(row);
      }),
    );
    // A replay that won the lock inside the transaction leaves this upload orphaned.
    if (photo && evidence && result.photo?.storageKey !== photo.storageKey) {
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
    .orderBy(desc(contractingHourReadings.sequence));
  return rows.map((row) => ({ ...withHint(row), exceptionTypes: readingExceptionTypes(row) }));
}
// The machine lock serializes captures and amendments. Pair resolution changes multiple rows in
// the same transaction, so each resulting row is diffed and audited after that resolution.
async function updateAudited(
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  before: Row,
  patch: Partial<Omit<Row, 'sequence'>>,
) {
  return mutateEntity({
    db: tx,
    actorUserId,
    descriptor,
    table: contractingHourReadings,
    id: before.id,
    notFound,
    set: () => patch,
    project: (_tx, row) => withHint(row),
  });
}
export async function amendReading({ db, actor, input: raw }: { db: Db; actor: JobActor; input: ReadingAmendInput }) {
  const actorUserId = actor.userId;
  const input = ReadingAmendInput.parse(raw);
  return db.transaction(async (tx) => {
    const owner = await tx.query.contractingHourReadings.findFirst({ where: eq(contractingHourReadings.id, input.id) });
    if (!owner) throw notFound();
    const [machine] = await tx
      .select()
      .from(contractingMachines)
      .where(eq(contractingMachines.id, owner.machineId))
      .for('update');
    if (!machine) throw notFound();
    const affected = await lockJobsMovedBy(tx, owner);
    for (const job of affected) assertReadingJobAction('amendReadings', job, actor);
    const rows = await tx
      .select()
      .from(contractingHourReadings)
      .where(eq(contractingHourReadings.machineId, owner.machineId))
      .orderBy(asc(contractingHourReadings.sequence));
    const resolution = resolveReadingAmendment(rows, input);
    if (!resolution.ok) {
      if (resolution.reason === 'not_found') throw notFound();
      throw new ReadingError('reading.invalid_amendment', 'Amended hours must be between the neighbouring readings.');
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const { id, ...dispute } of resolution.changes) {
      const before = byId.get(id);
      if (!before) continue;
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
              gt(contractingHourReadings.sequence, reading.sequence),
            ),
          )
          .orderBy(asc(contractingHourReadings.sequence))
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
/** What the AI reads off a stored meter photo, measured against the value it was captured with. */
async function checkStoredPhoto(storage: StorageAdapter, reading: Row, storageKey: string, readPhoto: ReadMeterPhoto) {
  const photo = await readStoredObject(storage, storageKey);
  return verifyPhoto(reading.value, photo.bytes, photo.contentType, readPhoto);
}

/**
 * Lands an AI verdict under the Machine's lock, judged against the reading's value as it stands then, so an
 * amendment made while the AI was reading is respected. `lands` may refuse it, returning the reading unchanged.
 */
async function recordVerdict(
  db: Db,
  reading: Row,
  evidence: AiVerdict,
  {
    actorUserId,
    lands = () => true,
    patch = {},
  }: {
    actorUserId: (before: Row) => AuthId;
    lands?: (before: Row) => boolean;
    patch?: Partial<Omit<Row, 'sequence'>>;
  },
) {
  return db.transaction(async (tx) => {
    await tx.select().from(contractingMachines).where(eq(contractingMachines.id, reading.machineId)).for('update');
    const before = await getReading({ db: tx, id: reading.id });
    if (!lands(before)) return before;
    return updateAudited(tx, actorUserId(before), before, {
      ...evidence,
      ...patch,
      aiVerification: readingVerification(before.value, evidence.aiValue, evidence.aiConfidence),
    });
  });
}

/**
 * Checks a just-captured reading's photo and records the AI's verdict. It runs after the capture has answered, so
 * the person capturing never waits on the AI. A verdict lands only on a reading still pending on the same photo, so a
 * re-verify in the meantime wins. A failed check leaves the reading pending, for Re-verify to finish.
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
  const storageKey = captured.photo.storageKey;
  const evidence = await checkStoredPhoto(storage, captured, storageKey, readPhoto);
  if (evidence.aiVerification === 'pending') return captured;
  return recordVerdict(db, captured, evidence, {
    // The capture's own follow-up, so it is audited as the person who captured it.
    actorUserId: (before) => before.capturedByUserId,
    lands: (before) => before.aiVerification === 'pending' && before.photo?.storageKey === storageKey,
  });
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
  const evidence = await checkStoredPhoto(storage, owner, owner.photo.storageKey, readPhoto);
  if (evidence.aiVerification === 'pending')
    throw new ReadingError(
      'reading.verification_failed',
      'AI verification failed. Previous evidence has been kept; try again.',
    );
  // A fresh verdict reopens the evidence for review.
  return recordVerdict(db, owner, evidence, { actorUserId: () => actorUserId, patch: { evidenceReviewedAt: null } });
}

export async function listFieldReadings({ db, machineId }: { db: Db; machineId: string }) {
  const rows = await db
    .select()
    .from(contractingHourReadings)
    .where(eq(contractingHourReadings.machineId, machineId))
    .orderBy(desc(contractingHourReadings.sequence));
  return rows.map((row) => FieldReading.parse(readingToWire(row)));
}
