import { randomUUID } from 'node:crypto';
import { type DatabaseTransaction, type Db, getSortOrder, user, withPagination } from '@pkg/db';
import {
  contractingBreakdownNotes,
  contractingBreakdowns,
  contractingImplements,
  contractingJobs,
  contractingMachineAssignments,
  contractingMachines,
} from '@pkg/db/contracting';
import { hasPermission, validateFile } from '@pkg/domain';
import {
  BREAKDOWN_PHOTO_POLICY,
  type BreakdownActor,
  breakdownFirstLine,
  breakdownReadScope,
  deriveBreakdownActions,
} from '@pkg/domain/contracting';
import { type AuthId, type ContractingRole, getNextCursor } from '@pkg/schema';
import {
  BREAKDOWN_MAX_PHOTOS,
  type BreakdownActionName,
  BreakdownAssignMechanicInput,
  BreakdownDetail,
  type BreakdownListInput,
  type BreakdownListResult,
  BreakdownNote,
  BreakdownNoteCreateInput,
  BreakdownPatchInput,
  BreakdownPhotoRemoveInput,
  type BreakdownQueueSummary,
  BreakdownReportInput,
  BreakdownSolveInput,
  type BreakdownSubjectRef,
  type BreakdownSummary,
  openJobStatuses,
  unsolvedBreakdownStatuses,
} from '@pkg/schema/contracting';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, type SQL, sql } from 'drizzle-orm';
import { recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { FilePolicyViolationError } from '../../files/file-errors.js';
import type { StorageAdapter } from '../../storage/storage-adapter.js';
import { breakdownDescriptor } from './breakdown-audit.js';
import {
  assertBreakdownAction,
  BreakdownError,
  breakdownNotFound,
  invalidMechanic,
  withBreakdownConstraints,
} from './breakdown-errors.js';
import {
  breakdownActionSubject,
  breakdownReadableBy,
  breakdownSubjectOf,
  type DbOrTx,
  type LoadedBreakdown,
  loadReadableBreakdown,
  selectBreakdowns,
  toBreakdownSummary,
} from './breakdown-load.js';

type Row = typeof contractingBreakdowns.$inferSelect;
type BreakdownPhoto = Row['photos'][number];

/** Photos a Breakdown write stores: the bytes and where they are kept. */
export type BreakdownEvidence = { storage: StorageAdapter; photos: Uint8Array[] };

const tooManyPhotos = () =>
  new BreakdownError('breakdown.too_many_photos', `A Breakdown keeps at most ${BREAKDOWN_MAX_PHOTOS} photos.`);
const unsolved = inArray(contractingBreakdowns.status, [...unsolvedBreakdownStatuses]);

/** Validates and stores every photo before the row is written; the caller deletes them if the write fails. */
async function storePhotos({ storage, photos }: BreakdownEvidence): Promise<BreakdownPhoto[]> {
  const validated = photos.map((bytes) => {
    const validation = validateFile(bytes, BREAKDOWN_PHOTO_POLICY);
    if (!validation.ok) throw new FilePolicyViolationError(validation);
    return { bytes, validation };
  });
  const stored: BreakdownPhoto[] = [];
  try {
    for (const { bytes, validation } of validated) {
      const photo: BreakdownPhoto = {
        id: randomUUID(),
        byteSize: validation.byteSize,
        contentType: validation.contentType,
        storageKey: `contracting/breakdowns/${randomUUID()}`,
        updatedAt: new Date().toISOString(),
      };
      await storage.put({
        key: photo.storageKey,
        body: bytes,
        byteSize: photo.byteSize,
        contentType: photo.contentType,
      });
      stored.push(photo);
    }
  } catch (error) {
    await deletePhotos(storage, stored, error);
    throw error;
  }
  return stored;
}

async function deletePhotos(storage: StorageAdapter, photos: readonly BreakdownPhoto[], cause?: unknown) {
  try {
    for (const photo of photos) await storage.deleteObject(photo.storageKey);
  } catch (cleanupError) {
    if (cause) throw new AggregateError([cause, cleanupError], 'Breakdown write failed and photo cleanup failed');
    throw cleanupError;
  }
}

/** Runs a write that stored photos first: a failure, or a write that kept none of them, removes them again. */
async function withStoredPhotos<T>(
  evidence: BreakdownEvidence | undefined,
  write: (photos: BreakdownPhoto[]) => Promise<{ result: T; kept: boolean }>,
): Promise<T> {
  const photos = evidence?.photos.length ? await storePhotos(evidence) : [];
  try {
    const { result, kept } = await write(photos);
    if (!kept && evidence) await deletePhotos(evidence.storage, photos);
    return result;
  } catch (error) {
    if (evidence) await deletePhotos(evidence.storage, photos, error);
    throw error;
  }
}

const subjectColumn = (kind: BreakdownSubjectRef['kind']) =>
  kind === 'machine' ? contractingMachineAssignments.machineId : contractingMachineAssignments.implementId;

/** Locks the subject row and refuses an unknown or retired one. */
async function lockSubject(tx: DatabaseTransaction, subject: BreakdownSubjectRef) {
  const table = subject.kind === 'machine' ? contractingMachines : contractingImplements;
  const [row] = await tx
    .select({ id: table.id, retiredAt: table.retiredAt })
    .from(table)
    .where(eq(table.id, subject.id))
    .for('update');
  if (!row || row.retiredAt)
    throw new BreakdownError(
      'breakdown.invalid_subject',
      subject.kind === 'machine' ? 'Choose an active Machine.' : 'Choose an active Implement.',
    );
}

/**
 * The Job a Breakdown hangs on. Omitted, it is the Job the subject is on site on now (an Implement through
 * the stint it is attached to), or none. Named, the Job must be open with the subject planned or on site on
 * it, and someone who reads only their own Breakdowns may name only a Job they are Foreman of.
 */
async function resolveJob(
  tx: DatabaseTransaction,
  actor: BreakdownActor,
  subject: BreakdownSubjectRef,
  jobId: string | null | undefined,
): Promise<string | null> {
  if (jobId === null) return null;
  const onSubject = eq(subjectColumn(subject.kind), subject.id);
  if (jobId === undefined) {
    const [stint] = await tx
      .select({ jobId: contractingMachineAssignments.jobId })
      .from(contractingMachineAssignments)
      .where(
        and(
          onSubject,
          isNotNull(contractingMachineAssignments.arrivalReadingId),
          isNull(contractingMachineAssignments.departureReadingId),
        ),
      )
      .limit(1);
    return stint?.jobId ?? null;
  }
  const invalidJob = (message: string) => new BreakdownError('breakdown.invalid_job', message);
  const [job] = await tx
    .select({ status: contractingJobs.status, foremanUserId: contractingJobs.foremanUserId })
    .from(contractingJobs)
    .where(eq(contractingJobs.id, jobId))
    .for('share');
  if (!job || !(openJobStatuses as readonly string[]).includes(job.status))
    throw invalidJob('Choose an Upcoming or Active Job.');
  if (breakdownReadScope(actor) === 'own' && job.foremanUserId !== actor.userId)
    throw invalidJob('Choose a Job you are Foreman of.');
  const [stint] = await tx
    .select({ id: contractingMachineAssignments.id })
    .from(contractingMachineAssignments)
    .where(and(onSubject, eq(contractingMachineAssignments.jobId, jobId)))
    .limit(1);
  if (!stint) throw invalidJob(`This ${subject.kind === 'machine' ? 'Machine' : 'Implement'} is not on that Job.`);
  return jobId;
}

const subjectOfRow = (row: Pick<Row, 'machineId' | 'implementId'>): BreakdownSubjectRef =>
  row.machineId ? { kind: 'machine', id: row.machineId } : { kind: 'implement', id: row.implementId ?? '' };

export async function reportBreakdown({
  db,
  actor,
  input: raw,
  evidence,
  now = new Date(),
}: {
  db: Db;
  actor: BreakdownActor;
  input: BreakdownReportInput;
  evidence?: BreakdownEvidence;
  now?: Date;
}): Promise<BreakdownDetail> {
  const input = BreakdownReportInput.parse(raw);
  if (!hasPermission(actor, 'contracting_breakdown:report'))
    throw new BreakdownError('breakdown.forbidden', 'You cannot report Breakdowns.');
  if ((evidence?.photos.length ?? 0) > BREAKDOWN_MAX_PHOTOS) throw tooManyPhotos();
  // A phone retry of an already delivered report returns the stored Breakdown instead of a duplicate.
  async function replay(db: DbOrTx) {
    if (!input.localId) return null;
    const [row] = await db.select().from(contractingBreakdowns).where(eq(contractingBreakdowns.id, input.localId));
    if (!row) return null;
    const subject = subjectOfRow(row);
    if (row.reportedByUserId !== actor.userId || subject.kind !== input.subject.kind || subject.id !== input.subject.id)
      throw new BreakdownError('breakdown.report_id_conflict', 'This report identifier has already been used.');
    return getBreakdown({ db, actor, id: row.id });
  }
  const delivered = await replay(db);
  if (delivered) return delivered;
  return withStoredPhotos(evidence, (photos) =>
    withBreakdownConstraints(() =>
      db.transaction(async (tx) => {
        await lockSubject(tx, input.subject);
        const delivered = await replay(tx);
        if (delivered) return { result: delivered, kept: false };
        const jobId = await resolveJob(tx, actor, input.subject, input.jobId);
        const [row] = await tx
          .insert(contractingBreakdowns)
          .values({
            ...(input.localId ? { id: input.localId } : {}),
            machineId: input.subject.kind === 'machine' ? input.subject.id : null,
            implementId: input.subject.kind === 'implement' ? input.subject.id : null,
            jobId,
            reportedByUserId: actor.userId,
            reportedAt: now,
            urgency: input.urgency,
            description: input.description,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            photos,
          })
          .returning();
        if (!row) throw new Error('Breakdown insert returned no row');
        await recordAuditCreate({ db: tx, actorUserId: actor.userId, descriptor: breakdownDescriptor, input: row });
        return { result: await getBreakdown({ db: tx, actor, id: row.id }), kept: true };
      }),
    ),
  );
}

async function listNotes(db: DbOrTx, breakdownId: string): Promise<BreakdownNote[]> {
  const rows = await db
    .select({ note: contractingBreakdownNotes, authorName: user.name })
    .from(contractingBreakdownNotes)
    .innerJoin(user, eq(user.id, contractingBreakdownNotes.authorUserId))
    .where(eq(contractingBreakdownNotes.breakdownId, breakdownId))
    .orderBy(asc(contractingBreakdownNotes.createdAt), asc(contractingBreakdownNotes.id));
  return rows.map(({ note, authorName }) => toNote(note, authorName));
}

const toNote = (note: typeof contractingBreakdownNotes.$inferSelect, authorName: string) =>
  BreakdownNote.parse({ ...note, authorName, createdAt: note.createdAt.toISOString() });

async function toDetail(db: DbOrTx, actor: BreakdownActor, row: LoadedBreakdown): Promise<BreakdownDetail> {
  const { breakdown } = row;
  const hints = breakdown.jobId
    ? await selectBreakdowns(db)
        .where(
          and(
            eq(contractingBreakdowns.jobId, breakdown.jobId),
            ne(contractingBreakdowns.id, breakdown.id),
            unsolved,
            breakdownReadableBy(actor),
          ),
        )
        .orderBy(desc(contractingBreakdowns.reportedAt))
    : [];
  return BreakdownDetail.parse({
    ...toBreakdownSummary(row),
    description: breakdown.description,
    latitude: breakdown.latitude,
    longitude: breakdown.longitude,
    photos: breakdown.photos,
    closeOutNote: breakdown.closeOutNote,
    notes: await listNotes(db, breakdown.id),
    dispatchHints: hints.map((hint) => ({
      breakdownId: hint.breakdown.id,
      subject: breakdownSubjectOf(hint),
      urgency: hint.breakdown.urgency,
      firstLine: breakdownFirstLine(hint.breakdown.description),
    })),
    actions: deriveBreakdownActions(breakdownActionSubject(row), actor),
  });
}

/** One Breakdown the actor may read, with its notes, dispatch hints and Breakdown Actions. */
export async function getBreakdown({
  db,
  actor,
  id,
}: {
  db: DbOrTx;
  actor: BreakdownActor;
  id: string;
}): Promise<BreakdownDetail> {
  const row = await loadReadableBreakdown(db, actor, id);
  if (!row) throw breakdownNotFound();
  return toDetail(db, actor, row);
}

function breakdownListOrder({ sortBy, sortDirection }: Pick<BreakdownListInput, 'sortBy' | 'sortDirection'>): SQL[] {
  const byReported = [desc(contractingBreakdowns.reportedAt), asc(contractingBreakdowns.id)];
  if (sortBy === 'urgency')
    return [getSortOrder(sql`(${contractingBreakdowns.urgency} = 'code-red')`, sortDirection), ...byReported];
  return [getSortOrder(contractingBreakdowns.reportedAt, sortDirection), asc(contractingBreakdowns.id)];
}

export async function listBreakdowns({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: BreakdownActor;
  input: BreakdownListInput;
}): Promise<BreakdownListResult> {
  const where = and(
    input.statuses.length ? inArray(contractingBreakdowns.status, input.statuses) : undefined,
    input.machineId ? eq(contractingBreakdowns.machineId, input.machineId) : undefined,
    input.implementId ? eq(contractingBreakdowns.implementId, input.implementId) : undefined,
    input.jobId ? eq(contractingBreakdowns.jobId, input.jobId) : undefined,
    input.mechanicUserId ? eq(contractingBreakdowns.primaryMechanicUserId, input.mechanicUserId) : undefined,
    breakdownReadableBy(actor),
  );
  const matching = () =>
    selectBreakdowns(db)
      .where(where)
      .orderBy(...breakdownListOrder(input));
  const rows = await withPagination(matching(), input);
  // Every row carries the full match count; a stale cursor past the end asks for the first row to learn it.
  const counted = rows[0] ?? (input.cursor > 0 ? (await matching().limit(1))[0] : undefined);
  const total = counted?.total ?? 0;
  const items = rows.map(toBreakdownSummary);
  return { items, nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }), total };
}

/** The workshop queue's counts across every Breakdown the actor may read. */
export async function summarizeBreakdownQueue({
  db,
  actor,
}: {
  db: Db;
  actor: BreakdownActor;
}): Promise<BreakdownQueueSummary> {
  const [counts] = await db
    .select({
      open: sql<number>`count(*) filter (where ${contractingBreakdowns.status} = 'open')::integer`,
      inProgress: sql<number>`count(*) filter (where ${contractingBreakdowns.status} = 'in-progress')::integer`,
      codeRedUnsolved: sql<number>`count(*) filter (where ${contractingBreakdowns.urgency} = 'code-red' and ${contractingBreakdowns.status} <> 'solved')::integer`,
    })
    .from(contractingBreakdowns)
    .leftJoin(contractingJobs, eq(contractingJobs.id, contractingBreakdowns.jobId))
    .where(breakdownReadableBy(actor));
  return counts ?? { open: 0, inProgress: 0, codeRedUnsolved: 0 };
}

async function jobForemanOf(tx: DatabaseTransaction, jobId: string | null) {
  if (!jobId) return null;
  const [job] = await tx
    .select({ foremanUserId: contractingJobs.foremanUserId })
    .from(contractingJobs)
    .where(eq(contractingJobs.id, jobId));
  return job?.foremanUserId ?? null;
}

/** Refuses unless the actor may take this action on the locked row. */
async function assertActionOn(
  tx: DatabaseTransaction,
  action: BreakdownActionName,
  before: Row,
  actor: BreakdownActor,
) {
  const jobForemanUserId = await jobForemanOf(tx, before.jobId);
  assertBreakdownAction(
    action,
    { status: before.status, reportedByUserId: before.reportedByUserId, jobForemanUserId },
    actor,
  );
}

/** An audited write to one Breakdown, gated by a Breakdown Action under the row lock; answers the fresh detail. */
function writeBreakdown({
  db,
  actor,
  id,
  action,
  assert,
  set,
}: {
  db: Db | DatabaseTransaction;
  actor: BreakdownActor;
  id: string;
  action: BreakdownActionName;
  assert?: (tx: DatabaseTransaction, before: Row) => Promise<void>;
  set: (before: Row) => Partial<typeof contractingBreakdowns.$inferInsert>;
}) {
  return withBreakdownConstraints(() =>
    mutateEntity({
      db,
      actorUserId: actor.userId,
      descriptor: breakdownDescriptor,
      table: contractingBreakdowns,
      id,
      notFound: breakdownNotFound,
      assert: async (tx, before) => {
        await assertActionOn(tx, action, before, actor);
        await assert?.(tx, before);
      },
      set: (before) => ({ ...set(before), updatedAt: new Date() }),
      project: (tx, row) => getBreakdown({ db: tx, actor, id: row.id }),
    }),
  );
}

export async function patchBreakdown({
  db,
  actor,
  input: raw,
}: {
  db: Db;
  actor: BreakdownActor;
  input: BreakdownPatchInput;
}): Promise<BreakdownDetail> {
  const input = BreakdownPatchInput.parse(raw);
  let jobId: string | null | undefined;
  return writeBreakdown({
    db,
    actor,
    id: input.id,
    action: 'editReport',
    assert: async (tx, before) => {
      jobId =
        input.jobId === undefined || input.jobId === before.jobId
          ? before.jobId
          : await resolveJob(tx, actor, subjectOfRow(before), input.jobId);
    },
    set: (before) => ({
      description: input.description ?? before.description,
      urgency: input.urgency ?? before.urgency,
      jobId: jobId ?? null,
    }),
  });
}

/** Locks the user and refuses anyone but a non-device Mechanic. */
async function assertMechanic(tx: DatabaseTransaction, userId: AuthId) {
  const [person] = await tx
    .select({ role: user.contractingRole, isDevice: user.isDevice })
    .from(user)
    .where(eq(user.id, userId))
    .for('share');
  if (person?.role !== 'mechanic' || person.isDevice) throw invalidMechanic();
}

export async function assignMechanic({
  db,
  actor,
  input: raw,
}: {
  db: Db;
  actor: BreakdownActor;
  input: BreakdownAssignMechanicInput;
}): Promise<BreakdownDetail> {
  const input = BreakdownAssignMechanicInput.parse(raw);
  return writeBreakdown({
    db,
    actor,
    id: input.id,
    action: 'assignMechanic',
    assert: async (tx) => {
      if (input.mechanicUserId) await assertMechanic(tx, input.mechanicUserId);
    },
    set: () => ({ primaryMechanicUserId: input.mechanicUserId }),
  });
}

export async function startBreakdown({
  db,
  actor,
  id,
  now = new Date(),
}: {
  db: Db;
  actor: BreakdownActor;
  id: string;
  now?: Date;
}): Promise<BreakdownDetail> {
  return writeBreakdown({
    db,
    actor,
    id,
    action: 'start',
    set: () => ({ status: 'in-progress', startedAt: now, startedByUserId: actor.userId }),
  });
}

/** Solves an Open or In Progress Breakdown with its close-out note; solving straight from Open stamps the start too. */
export async function solveBreakdown({
  db,
  actor,
  input: raw,
  now = new Date(),
}: {
  db: Db;
  actor: BreakdownActor;
  input: BreakdownSolveInput;
  now?: Date;
}): Promise<BreakdownDetail> {
  const input = BreakdownSolveInput.parse(raw);
  return writeBreakdown({
    db,
    actor,
    id: input.id,
    action: 'solve',
    set: (before) => ({
      status: 'solved',
      startedAt: before.startedAt ?? now,
      startedByUserId: before.startedByUserId ?? actor.userId,
      solvedAt: now,
      solvedByUserId: actor.userId,
      closeOutNote: input.closeOutNote,
    }),
  });
}

/** Appends a Breakdown Note under the Breakdown's lock. Notes are authored and append-only, so not audited. */
export async function addBreakdownNote({
  db,
  actor,
  input: raw,
}: {
  db: Db;
  actor: BreakdownActor;
  input: BreakdownNoteCreateInput;
}): Promise<BreakdownNote> {
  const input = BreakdownNoteCreateInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(contractingBreakdowns)
      .where(eq(contractingBreakdowns.id, input.breakdownId))
      .for('update');
    if (!before) throw breakdownNotFound();
    await assertActionOn(tx, 'addNote', before, actor);
    const [note] = await tx
      .insert(contractingBreakdownNotes)
      .values({ breakdownId: before.id, authorUserId: actor.userId, text: input.text })
      .returning();
    if (!note) throw new Error('Breakdown Note insert returned no row');
    const [author] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actor.userId));
    return toNote(note, author?.name ?? '');
  });
}

export async function addBreakdownPhotos({
  db,
  actor,
  id,
  evidence,
}: {
  db: Db;
  actor: BreakdownActor;
  id: string;
  evidence: BreakdownEvidence;
}): Promise<BreakdownDetail> {
  if (evidence.photos.length > BREAKDOWN_MAX_PHOTOS) throw tooManyPhotos();
  return withStoredPhotos(evidence, async (photos) => ({
    result: await writeBreakdown({
      db,
      actor,
      id,
      action: 'addPhotos',
      assert: async (_tx, before) => {
        if (before.photos.length + photos.length > BREAKDOWN_MAX_PHOTOS) throw tooManyPhotos();
      },
      set: (before) => ({ photos: [...before.photos, ...photos] }),
    }),
    kept: true,
  }));
}

export async function removeBreakdownPhoto({
  db,
  actor,
  input: raw,
  storage,
}: {
  db: Db;
  actor: BreakdownActor;
  input: BreakdownPhotoRemoveInput;
  storage: StorageAdapter;
}): Promise<BreakdownDetail> {
  const input = BreakdownPhotoRemoveInput.parse(raw);
  let removed: BreakdownPhoto | undefined;
  const detail = await writeBreakdown({
    db,
    actor,
    id: input.id,
    action: 'addPhotos',
    assert: async (_tx, before) => {
      removed = before.photos.find((photo) => photo.id === input.photoId);
      if (!removed) throw new BreakdownError('breakdown.not_found', 'Photo not found.');
    },
    set: (before) => ({ photos: before.photos.filter((photo) => photo.id !== input.photoId) }),
  });
  if (removed) await storage.deleteObject(removed.storageKey);
  return detail;
}

/** One photo of a Breakdown the actor may read, for the download route. */
export async function getBreakdownPhoto({
  db,
  actor,
  id,
  photoId,
}: {
  db: Db;
  actor: BreakdownActor;
  id: string;
  photoId: string;
}): Promise<BreakdownPhoto> {
  const row = await loadReadableBreakdown(db, actor, id);
  const photo = row?.breakdown.photos.find((candidate) => candidate.id === photoId);
  if (!photo) throw new BreakdownError('breakdown.not_found', 'Photo not found.');
  return photo;
}

/** The people a workshop manager may assign: non-device users with the Contracting mechanic role. */
export async function listMechanics({ db }: { db: Db }) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.contractingRole, 'mechanic'), eq(user.isDevice, false)))
    .orderBy(asc(user.name));
}

/** Unsolved Breakdowns on one Machine or Implement: the report screen's duplicate check, open to every reporter. */
export async function listOpenBreakdownsOnSubject({
  db,
  subject,
}: {
  db: Db;
  subject: BreakdownSubjectRef;
}): Promise<BreakdownSummary[]> {
  const column = subject.kind === 'machine' ? contractingBreakdowns.machineId : contractingBreakdowns.implementId;
  const rows = await selectBreakdowns(db)
    .where(and(eq(column, subject.id), unsolved))
    .orderBy(desc(contractingBreakdowns.reportedAt));
  return rows.map(toBreakdownSummary);
}

/** A Machine's or Implement's whole Breakdown history, newest first. */
export async function listBreakdownsForSubject({
  db,
  ...subject
}: {
  db: Db;
} & ({ machineId: string; implementId?: never } | { implementId: string; machineId?: never })): Promise<
  BreakdownSummary[]
> {
  const where = subject.machineId
    ? eq(contractingBreakdowns.machineId, subject.machineId)
    : eq(contractingBreakdowns.implementId, subject.implementId ?? '');
  const rows = await selectBreakdowns(db).where(where).orderBy(desc(contractingBreakdowns.reportedAt));
  return rows.map(toBreakdownSummary);
}

/** Refuses a role or device change that would strand a Mechanic's unsolved Breakdowns. */
export async function assertMechanicAccountChangeAllowed({
  db,
  userId,
  contractingRole,
  isDevice,
}: {
  db: Db;
  userId: AuthId;
  contractingRole?: ContractingRole | null | undefined;
  isDevice?: boolean | undefined;
}) {
  if ((contractingRole === undefined || contractingRole === 'mechanic') && isDevice !== true) return;
  const [assigned] = await db
    .select({ id: contractingBreakdowns.id })
    .from(contractingBreakdowns)
    .where(and(eq(contractingBreakdowns.primaryMechanicUserId, userId), unsolved))
    .limit(1);
  if (assigned)
    throw new BreakdownError(
      'breakdown.invalid_mechanic',
      "Reassign this mechanic's open Breakdowns before changing their role.",
    );
}
