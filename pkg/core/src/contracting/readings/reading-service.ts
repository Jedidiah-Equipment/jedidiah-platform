import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction, Db, StoredFile } from '@pkg/db';
import { getForeignKeyViolationConstraint, getUniqueViolationConstraint, isUniqueViolation, user } from '@pkg/db';
import {
  contractingCategories,
  contractingHourReadings,
  contractingImplements,
  contractingJobs,
  contractingMachineAssignments,
  contractingMachines,
} from '@pkg/db/contracting';
import { validateFile } from '@pkg/domain';
import { meterDisagreementHint, resolveReadingAmendment } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import {
  FieldReading,
  ReadingAmendInput,
  ReadingCaptureInput,
  type ReadingExceptionType,
} from '@pkg/schema/contracting';
import { and, asc, desc, eq, getTableColumns, inArray, isNull, or } from 'drizzle-orm';
import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditUpdate,
} from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { FilePolicyViolationError } from '../../files/file-errors.js';
import { readStoredObject, type StorageAdapter } from '../../storage/storage-adapter.js';
import { assignmentDescriptor } from '../jobs/assignment-service.js';
import { jobDescriptor } from '../jobs/job-service.js';
import { READING_PHOTO_POLICY, type ReadMeterPhoto, readingVerification, verifyPhoto } from './reading-evidence.js';

export type ReadingErrorCode =
  | 'reading.not_found'
  | 'reading.retired_machine'
  | 'reading.capture_id_conflict'
  | 'reading.previous_changed'
  | 'reading.below_latest'
  | 'reading.baseline_exists'
  | 'reading.invalid_amendment'
  | 'reading.forbidden'
  | 'reading.wrong_status'
  | 'reading.invalid_role'
  | 'reading.machine_on_site'
  | 'reading.implement_on_site'
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
const aiExceptionVerifications = [
  'pending',
  'disagrees',
  'low-confidence',
] as const satisfies readonly Row['aiVerification'][];
const aiExceptionVerificationSet = new Set<Row['aiVerification']>(aiExceptionVerifications);

function getReadingExceptionTypes(row: Row): ReadingExceptionType[] {
  const types: ReadingExceptionType[] = [];
  if (row.disputed) types.push('disputed');
  if (row.evidenceReviewedAt === null && aiExceptionVerificationSet.has(row.aiVerification)) types.push('ai-flagged');
  return types;
}

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

async function assertArrivalResources(
  tx: DatabaseTransaction,
  implementId: string | null,
  driverUserId: string | null,
) {
  if (implementId) {
    const [implement] = await tx
      .select({ retiredAt: contractingImplements.retiredAt })
      .from(contractingImplements)
      .where(eq(contractingImplements.id, implementId))
      .for('update');
    if (!implement || implement.retiredAt)
      throw new ReadingError('reading.invalid_role', 'The selected Implement is no longer available.');
  }
  if (driverUserId) {
    const [driver] = await tx
      .select({ contractingRole: user.contractingRole, isDevice: user.isDevice })
      .from(user)
      .where(eq(user.id, driverUserId))
      .for('update');
    if (driver?.contractingRole !== 'driver' || driver.isDevice)
      throw new ReadingError('reading.invalid_role', 'Select a person with the Contracting driver role.');
  }
}

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
      let stint: typeof contractingMachineAssignments.$inferSelect | undefined;
      let stintJob: typeof contractingJobs.$inferSelect | undefined;
      let createdStint = false;
      const [actor] =
        input.assignmentId || input.startAssignment
          ? await tx
              .select({ contractingRole: user.contractingRole, equipmentRole: user.role })
              .from(user)
              .where(eq(user.id, actorUserId))
          : [];
      const management =
        actor?.equipmentRole === 'super-admin' ||
        actor?.contractingRole === 'contracting-admin' ||
        actor?.contractingRole === 'contracting-manager';
      if (input.assignmentId) {
        const [unlockedStint] = await tx
          .select({ jobId: contractingMachineAssignments.jobId })
          .from(contractingMachineAssignments)
          .where(eq(contractingMachineAssignments.id, input.assignmentId));
        if (!unlockedStint) throw new ReadingError('reading.not_found', 'Machine Assignment not found.');
        [stintJob] = await tx
          .select()
          .from(contractingJobs)
          .where(eq(contractingJobs.id, unlockedStint.jobId))
          .for('update');
        [stint] = await tx
          .select()
          .from(contractingMachineAssignments)
          .where(eq(contractingMachineAssignments.id, input.assignmentId))
          .for('update');
        if (!stint || !stintJob || stint.machineId !== input.machineId)
          throw new ReadingError('reading.not_found', 'Machine Assignment not found.');
        if (input.role === 'departure' && management && !evidence && !input.comment)
          throw new ReadingError('reading.invalid_role', 'A reason is required for a photo-less departure reading.');
        if (!management && stintJob.foremanUserId !== actorUserId)
          throw new ReadingError('reading.forbidden', 'This is not your Job.');
        if (!['upcoming', 'active'].includes(stintJob.status))
          throw new ReadingError('reading.wrong_status', 'This Job is no longer open.');
        if (input.role === 'arrival' && stint.arrivalReadingId)
          throw new ReadingError('reading.invalid_role', 'This Machine Assignment already arrived.');
        if (input.role === 'departure' && (!stint.arrivalReadingId || stint.departureReadingId))
          throw new ReadingError('reading.invalid_role', 'This Machine Assignment is not on site.');
      } else if (input.startAssignment) {
        [stintJob] = await tx
          .select()
          .from(contractingJobs)
          .where(eq(contractingJobs.id, input.startAssignment.jobId))
          .for('update');
        if (!stintJob) throw new ReadingError('reading.not_found', 'Job not found.');
        if (!management && stintJob.foremanUserId !== actorUserId)
          throw new ReadingError('reading.forbidden', 'This is not your Job.');
        if (!['upcoming', 'active'].includes(stintJob.status))
          throw new ReadingError('reading.wrong_status', 'This Job is no longer open.');
        const [inserted] = await tx
          .insert(contractingMachineAssignments)
          .values({
            id: input.startAssignment.localId,
            jobId: input.startAssignment.jobId,
            machineId: input.machineId,
            implementId: input.startAssignment.implementId,
            driverUserId: input.startAssignment.driverUserId ?? machine.currentDriverUserId,
            createdByUserId: actorUserId,
          })
          .onConflictDoNothing({ target: contractingMachineAssignments.id })
          .returning();
        createdStint = !!inserted;
        [stint] = inserted
          ? [inserted]
          : await tx
              .select()
              .from(contractingMachineAssignments)
              .where(eq(contractingMachineAssignments.id, input.startAssignment.localId))
              .for('update');
        if (!stint || stint.jobId !== stintJob.id || stint.machineId !== input.machineId)
          throw new ReadingError('reading.capture_id_conflict', 'This Machine Assignment identifier is already used.');
        if (stint.arrivalReadingId)
          throw new ReadingError('reading.invalid_role', 'This Machine Assignment already arrived.');
        if (createdStint)
          await recordAuditCreate({
            db: tx,
            actorUserId,
            descriptor: assignmentDescriptor(machine.code),
            input: stint,
          });
      }
      if (input.role === 'arrival' && stint) {
        const implementId =
          input.stintOverrides?.implementId !== undefined ? input.stintOverrides.implementId : stint.implementId;
        const driverUserId =
          input.stintOverrides?.driverUserId !== undefined ? input.stintOverrides.driverUserId : stint.driverUserId;
        await assertArrivalResources(tx, implementId, driverUserId);
      }
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
      if (stint && stintJob) {
        const now = new Date();
        const patch =
          input.role === 'arrival'
            ? {
                arrivalReadingId: row.id,
                ...(input.stintOverrides?.implementId !== undefined
                  ? { implementId: input.stintOverrides.implementId }
                  : {}),
                ...(input.stintOverrides?.driverUserId !== undefined
                  ? { driverUserId: input.stintOverrides.driverUserId }
                  : {}),
                updatedAt: now,
              }
            : { departureReadingId: row.id, updatedAt: now };
        const [updatedStint] = await tx
          .update(contractingMachineAssignments)
          .set(patch)
          .where(eq(contractingMachineAssignments.id, stint.id))
          .returning();
        if (!updatedStint) throw new ReadingError('reading.not_found', 'Machine Assignment not found.');
        const stintDescriptor = assignmentDescriptor(machine.code);
        const stintChanges = diffAuditUpdate(stintDescriptor, stint, updatedStint);
        if (stintChanges)
          await recordAuditUpdate({
            db: tx,
            actorUserId,
            descriptor: stintDescriptor,
            after: updatedStint,
            changes: stintChanges,
          });
        if (input.role === 'arrival' && stintJob.status === 'upcoming') {
          const [activeJob] = await tx
            .update(contractingJobs)
            .set({ status: 'active', updatedAt: now })
            .where(eq(contractingJobs.id, stintJob.id))
            .returning();
          if (!activeJob) throw new ReadingError('reading.not_found', 'Job not found.');
          const jobChanges = diffAuditUpdate(jobDescriptor, stintJob, activeJob);
          if (jobChanges)
            await recordAuditUpdate({
              db: tx,
              actorUserId,
              descriptor: jobDescriptor,
              after: activeJob,
              changes: jobChanges,
            });
        }
      }
      return withHint(row);
    });
    // A replay that won the lock inside the transaction leaves this upload orphaned.
    if (photo && evidence && result.photo?.storageKey !== photo.storageKey) {
      await evidence.storage.deleteObject(photo.storageKey);
    }
    return result;
  } catch (error) {
    const uniqueConstraint = isUniqueViolation(error) ? getUniqueViolationConstraint(error) : null;
    const foreignKeyConstraint = getForeignKeyViolationConstraint(error);
    const translatedError =
      uniqueConstraint === 'machine_assignment_machine_on_site_unique'
        ? new ReadingError(
            'reading.machine_on_site',
            'This Machine is still on site on another Job — capture its departure there first.',
          )
        : uniqueConstraint === 'machine_assignment_implement_on_site_unique'
          ? new ReadingError(
              'reading.implement_on_site',
              'This Implement is still on site on another Job — capture its departure there first.',
            )
          : foreignKeyConstraint === 'machine_assignment_driver_role'
            ? new ReadingError('reading.invalid_role', 'Select a person with the Contracting driver role.')
            : foreignKeyConstraint
              ? new ReadingError('reading.invalid_role', 'The selected Job, Implement, or Driver is no longer valid.')
              : error;
    if (photo && evidence) {
      try {
        await evidence.storage.deleteObject(photo.storageKey);
      } catch (cleanupError) {
        throw new AggregateError([translatedError, cleanupError], 'Reading failed and uploaded photo cleanup failed');
      }
    }
    throw translatedError;
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
          inArray(contractingHourReadings.aiVerification, aiExceptionVerifications),
        ),
      ),
    )
    .orderBy(desc(contractingHourReadings.sequence));
  return rows.map((row) => ({ ...withHint(row), exceptionTypes: getReadingExceptionTypes(row) }));
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
  // #1401: a Priced Job must return to Completed here once pricing writes exist.
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
