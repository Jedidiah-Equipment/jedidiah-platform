import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction, Db, StoredFile } from '@pkg/db';
import { contractingCategories, contractingHourReadings, contractingMachines } from '@pkg/db/contracting';
import { validateFile } from '@pkg/domain';
import { meterDisagreementHint, resolveReadingAmendment } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import { FieldReading, ReadingAmendInput, ReadingCaptureInput } from '@pkg/schema/contracting';
import { and, asc, desc, eq, getTableColumns, inArray, isNull, or } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { FilePolicyViolationError } from '../../files/file-errors.js';
import { readStoredObject, type StorageAdapter } from '../../storage/storage-adapter.js';
import { READING_PHOTO_POLICY, type ReadMeterPhoto, readingVerification, verifyPhoto } from './reading-evidence.js';

export type ReadingErrorCode =
  | 'reading.not_found'
  | 'reading.retired_machine'
  | 'reading.capture_id_conflict'
  | 'reading.previous_changed'
  | 'reading.below_latest'
  | 'reading.baseline_exists'
  | 'reading.invalid_amendment'
  | 'reading.no_photo'
  | 'reading.verification_failed';
export class ReadingError extends Error {
  constructor(
    readonly code: ReadingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReadingError';
  }
}
export const isReadingError = (error: unknown): error is ReadingError => error instanceof ReadingError;
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

/** A photo capture: the bytes, where they are kept, and the reader that checks them against the typed value. */
export type ReadingEvidence = { storage: StorageAdapter; readPhoto: ReadMeterPhoto; photoBytes: Uint8Array };
type AiVerdict = { aiValue: number | null; aiConfidence: number | null; aiVerification: Row['aiVerification'] };
const manualVerdict: AiVerdict = { aiValue: null, aiConfidence: null, aiVerification: 'not-applicable' };

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

/**
 * The ledger rules for a new reading against the latest one. Returns whether the capture disputes
 * the latest reading, which happens only when the value falls below it and the capturer asserted so.
 */
function assertCaptureAllowed(input: ReadingCaptureInput, latest: Row | undefined): boolean {
  if (
    input.disputePrevious &&
    input.expectedPreviousId !== undefined &&
    input.expectedPreviousId !== (latest?.id ?? null)
  )
    throw new ReadingError(
      'reading.previous_changed',
      'Another reading landed first. Review the latest reading before resubmitting a dispute.',
    );
  const below = !!latest && input.value < latest.value;
  if (below && !input.disputePrevious)
    throw new ReadingError(
      'reading.below_latest',
      'Reading is below the latest reading. Retake it or assert that the previous reading is wrong.',
    );
  if (input.role === 'baseline' && latest)
    throw new ReadingError('reading.baseline_exists', 'A Baseline Reading must be the first reading.');
  return below && input.disputePrevious;
}

export async function captureReading({
  db,
  actorUserId,
  input: raw,
  evidence,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ReadingCaptureInput;
  evidence?: ReadingEvidence;
}) {
  const input = ReadingCaptureInput.parse(raw);
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
  const photo = evidence ? await storeMeterPhoto(evidence) : null;
  try {
    const verdict =
      evidence && photo
        ? await verifyPhoto(input.value, evidence.photoBytes, photo.contentType, evidence.readPhoto)
        : manualVerdict;
    const result = await db.transaction(async (tx) => {
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
      const [latest] = await tx
        .select()
        .from(contractingHourReadings)
        .where(eq(contractingHourReadings.machineId, input.machineId))
        .orderBy(desc(contractingHourReadings.sequence))
        .limit(1);
      const disputed = assertCaptureAllowed(input, latest);
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
          disputedPreviousId: disputed && latest ? latest.id : null,
          disputeReason: disputed ? 'The previous reading is wrong.' : null,
        })
        .returning();
      if (!row) throw new Error('Reading insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return withHint(row);
    });
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

export async function listReadingExceptions({ db }: { db: Db }) {
  const rows = await db
    .select({
      ...getTableColumns(contractingHourReadings),
      machineCode: contractingMachines.code,
      categoryIcon: contractingCategories.icon,
      categoryColour: contractingCategories.colour,
    })
    .from(contractingHourReadings)
    .innerJoin(contractingMachines, eq(contractingMachines.id, contractingHourReadings.machineId))
    .innerJoin(contractingCategories, eq(contractingCategories.id, contractingMachines.categoryId))
    .where(
      or(
        eq(contractingHourReadings.disputed, true),
        and(
          isNull(contractingHourReadings.evidenceReviewedAt),
          inArray(contractingHourReadings.aiVerification, ['pending', 'disagrees', 'low-confidence']),
        ),
      ),
    )
    .orderBy(desc(contractingHourReadings.sequence));
  return rows.map(withHint);
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
export async function amendReading({
  db,
  actorUserId,
  input: raw,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ReadingAmendInput;
}) {
  const input = ReadingAmendInput.parse(raw);
  return db.transaction(async (tx) => {
    const owner = await tx.query.contractingHourReadings.findFirst({ where: eq(contractingHourReadings.id, input.id) });
    if (!owner) throw notFound();
    await tx.select().from(contractingMachines).where(eq(contractingMachines.id, owner.machineId)).for('update');
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
    return getReading({ db: tx, id: input.id });
  });
}

export async function getReading({ db, id }: { db: Db | DatabaseTransaction; id: string }) {
  const row = await db.query.contractingHourReadings.findFirst({ where: eq(contractingHourReadings.id, id) });
  if (!row) throw notFound();
  return withHint(row);
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
  const photo = await readStoredObject(storage, owner.photo.storageKey);
  const evidence = await verifyPhoto(owner.value, photo.bytes, photo.contentType, readPhoto);
  if (evidence.aiVerification === 'pending')
    throw new ReadingError(
      'reading.verification_failed',
      'AI verification failed. Previous evidence has been kept; try again.',
    );
  return db.transaction(async (tx) => {
    await tx.select().from(contractingMachines).where(eq(contractingMachines.id, owner.machineId)).for('update');
    const before = await getReading({ db: tx, id });
    return updateAudited(tx, actorUserId, before, {
      ...evidence,
      evidenceReviewedAt: null,
      aiVerification: readingVerification(before.value, evidence.aiValue, evidence.aiConfidence),
    });
  });
}

export async function listFieldReadings({ db, machineId }: { db: Db; machineId: string }) {
  return (await listReadingsByMachine({ db, machineId })).map((row) =>
    FieldReading.parse({ ...row, photoBacked: !!row.photo }),
  );
}
