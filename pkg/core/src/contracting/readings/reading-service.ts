import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction, Db, StoredFile } from '@pkg/db';
import { contractingHourReadings, contractingMachines } from '@pkg/db/contracting';
import { validateFile } from '@pkg/domain';
import type { AuthId } from '@pkg/schema';
import { ReadingAmendInput, ReadingCaptureInput } from '@pkg/schema/contracting';
import { asc, desc, eq, getTableColumns, inArray, or } from 'drizzle-orm';
import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditUpdate,
} from '../../audit/audit-writer.js';
import { FilePolicyViolationError } from '../../files/file-errors.js';
import { readStoredObject, type StorageAdapter } from '../../storage/storage-adapter.js';
import { READING_PHOTO_POLICY, type ReadMeterPhoto, readingVerification, verifyPhoto } from './reading-evidence.js';

export class ReadingError extends Error {
  constructor(
    readonly code: `reading.${string}`,
    message: string,
  ) {
    super(message);
    this.name = 'ReadingError';
  }
}
export const isReadingError = (error: unknown): error is ReadingError => error instanceof ReadingError;
type Row = typeof contractingHourReadings.$inferSelect;
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_reading',
  noun: 'Hour Reading',
  primaryLabelField: 'id',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    ...row,
    capturedAt: row.capturedAt.toISOString(),
    amendedAt: row.amendedAt?.toISOString() ?? null,
  }),
});
export async function listReadingsByMachine({ db, machineId }: { db: Db; machineId: string }) {
  return db
    .select()
    .from(contractingHourReadings)
    .where(eq(contractingHourReadings.machineId, machineId))
    .orderBy(desc(contractingHourReadings.sequence));
}
export async function captureReading({
  db,
  actorUserId,
  input: raw,
  storage,
  photoBytes,
  readPhoto,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ReadingCaptureInput;
  storage?: StorageAdapter;
  photoBytes?: Uint8Array;
  readPhoto?: ReadMeterPhoto;
}) {
  const input = ReadingCaptureInput.parse(raw);
  let photo: StoredFile | null = null;
  let evidence: { aiValue: number | null; aiConfidence: number | null; aiVerification: Row['aiVerification'] } = {
    aiValue: null,
    aiConfidence: null,
    aiVerification: 'not-applicable',
  };
  if (photoBytes !== undefined) {
    if (!storage || !readPhoto) throw new Error('Photo capture requires storage and a meter reader');
    const validation = validateFile(photoBytes, READING_PHOTO_POLICY);
    if (!validation.ok) throw new FilePolicyViolationError(validation);
    photo = {
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
  }
  try {
    if (photo && photoBytes && readPhoto)
      evidence = await verifyPhoto(input.value, photoBytes, photo.contentType, readPhoto);
    return await db.transaction(async (tx) => {
      const [machine] = await tx
        .select()
        .from(contractingMachines)
        .where(eq(contractingMachines.id, input.machineId))
        .for('update');
      if (!machine) throw new ReadingError('reading.not_found', 'Machine not found.');
      if (machine.retiredAt)
        throw new ReadingError('reading.retired_machine', 'Cannot capture readings for a retired Machine.');
      const [latest] = await tx
        .select()
        .from(contractingHourReadings)
        .where(eq(contractingHourReadings.machineId, input.machineId))
        .orderBy(desc(contractingHourReadings.sequence))
        .limit(1);
      if (latest && input.value < latest.value && !input.disputePrevious)
        throw new ReadingError(
          'reading.below_latest',
          'Reading is below the latest reading. Retake it or assert that the previous reading is wrong.',
        );
      if (input.role === 'baseline' && latest)
        throw new ReadingError('reading.baseline_exists', 'A Baseline Reading must be the first reading.');
      const disputed = !!latest && input.disputePrevious;
      if (disputed)
        await updateAudited(tx, actorUserId, latest, {
          disputed: true,
          disputeReason: 'The next capture disputes this reading.',
        });
      const [row] = await tx
        .insert(contractingHourReadings)
        .values({
          machineId: input.machineId,
          role: input.role,
          value: input.value,
          capturedAt: new Date(input.capturedAt),
          capturedByUserId: actorUserId,
          method: photo ? 'photo' : 'manual',
          photo,
          ...evidence,
          disputed,
          disputedPreviousId: disputed ? latest.id : null,
          disputeReason: disputed ? 'The previous reading is wrong.' : null,
        })
        .returning();
      if (!row) throw new Error('Reading insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return row;
    });
  } catch (error) {
    if (photo && storage) {
      try {
        await storage.deleteObject(photo.storageKey);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Reading failed and uploaded photo cleanup failed');
      }
    }
    throw error;
  }
}

export async function listReadingExceptions({ db }: { db: Db }) {
  return db
    .select({ ...getTableColumns(contractingHourReadings), machineCode: contractingMachines.code })
    .from(contractingHourReadings)
    .innerJoin(contractingMachines, eq(contractingMachines.id, contractingHourReadings.machineId))
    .where(
      or(
        eq(contractingHourReadings.disputed, true),
        inArray(contractingHourReadings.aiVerification, ['pending', 'disagrees', 'low-confidence']),
      ),
    )
    .orderBy(desc(contractingHourReadings.sequence));
}
// The machine lock serializes captures and amendments. Pair resolution changes multiple rows in
// the same transaction, so each resulting row is diffed and audited after that resolution.
async function updateAudited(tx: DatabaseTransaction, actorUserId: AuthId, before: Row, patch: Partial<Row>) {
  const after = { ...before, ...patch };
  const changes = diffAuditUpdate(descriptor, before, after);
  if (!changes) return before;
  const { sequence: _sequence, ...writable } = patch;
  const [row] = await tx
    .update(contractingHourReadings)
    .set(writable)
    .where(eq(contractingHourReadings.id, before.id))
    .returning();
  if (!row) throw new ReadingError('reading.not_found', 'Hour Reading not found.');
  await recordAuditUpdate({ db: tx, actorUserId, descriptor, after: row, changes });
  return row;
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
    if (!owner) throw new ReadingError('reading.not_found', 'Hour Reading not found.');
    await tx.select().from(contractingMachines).where(eq(contractingMachines.id, owner.machineId)).for('update');
    const rows = await tx
      .select()
      .from(contractingHourReadings)
      .where(eq(contractingHourReadings.machineId, owner.machineId))
      .orderBy(asc(contractingHourReadings.sequence));
    const originals = rows.map((row) => ({ ...row }));
    const index = rows.findIndex((row) => row.id === input.id);
    const before = rows[index];
    if (!before) throw new ReadingError('reading.not_found', 'Hour Reading not found.');
    const previous = rows[index - 1];
    const next = rows[index + 1];
    if ((previous && input.value < previous.value) || (next && input.value > next.value))
      throw new ReadingError('reading.invalid_amendment', 'Amended hours must be between the neighbouring readings.');
    rows[index] = {
      ...before,
      value: input.value,
      aiVerification: before.photo
        ? readingVerification(input.value, before.aiValue, before.aiConfidence)
        : 'not-applicable',
      amendedBy: actorUserId,
      amendedAt: new Date(),
      amendmentReason: input.reason,
    };
    const stillDisputed = new Set<string>();
    for (const row of rows) {
      if (!row.disputedPreviousId) continue;
      const previous = rows.find((candidate) => candidate.id === row.disputedPreviousId);
      if (!previous) continue;
      if (row.value >= previous.value && (row.id === input.id || previous.id === input.id))
        row.disputedPreviousId = null;
      else {
        stillDisputed.add(row.id);
        stillDisputed.add(previous.id);
      }
    }
    for (const original of originals) {
      const updated = rows.find((row) => row.id === original.id);
      if (!updated) continue;
      await updateAudited(tx, actorUserId, original, {
        ...updated,
        disputed: stillDisputed.has(updated.id),
        disputeReason: stillDisputed.has(updated.id) ? updated.disputeReason : null,
      });
    }
    return getReading({ db: tx, id: input.id });
  });
}

export async function getReading({ db, id }: { db: Db | DatabaseTransaction; id: string }) {
  const row = await db.query.contractingHourReadings.findFirst({ where: eq(contractingHourReadings.id, id) });
  if (!row) throw new ReadingError('reading.not_found', 'Hour Reading not found.');
  return row;
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
  return db.transaction(async (tx) => {
    await tx.select().from(contractingMachines).where(eq(contractingMachines.id, owner.machineId)).for('update');
    const before = await getReading({ db: tx, id });
    return updateAudited(tx, actorUserId, before, {
      ...evidence,
      aiVerification: readingVerification(before.value, evidence.aiValue, evidence.aiConfidence),
    });
  });
}
