import { randomUUID } from 'node:crypto';
import {
  createGlobalSearchCondition,
  type DatabaseTransaction,
  type Db,
  getSortOrder,
  onCalendarDays,
  paginateWithWindowTotal,
} from '@pkg/db';
import {
  contractingBreakdowns,
  contractingFarms,
  contractingImplements,
  contractingJobs,
  contractingMachineAssignments,
  contractingMachines,
  contractingServiceRecords,
} from '@pkg/db/contracting';
import { hasPermission, JOHANNESBURG_TIME_ZONE, validateFile } from '@pkg/domain';
import {
  BREAKDOWN_PHOTO_POLICY,
  type BreakdownActor,
  breakdownFirstLine,
  breakdownReadScope,
  breakdownSubjectKindLabels,
  deriveBreakdownActions,
  fieldReaderSeesJob,
  formatJobNumber,
} from '@pkg/domain/contracting';
import type { AuthId, ContractingRole } from '@pkg/schema';
import {
  BREAKDOWN_MAX_PHOTOS,
  type BreakdownActionName,
  BreakdownAssignMechanicInput,
  BreakdownDetail,
  BreakdownFilterOptions,
  BreakdownJobOption,
  type BreakdownListInput,
  type BreakdownListResult,
  BreakdownPatchInput,
  BreakdownPhotoRemoveInput,
  BreakdownQueueSummary,
  BreakdownReportContext,
  BreakdownReportInput,
  BreakdownSolveInput,
  type BreakdownStatus,
  type BreakdownSubjectRef,
  breakdownStatuses,
  openJobStatuses,
  unsolvedBreakdownStatuses,
} from '@pkg/schema/contracting';
import { and, asc, desc, eq, inArray, isNull, ne, or, type SQL, sql } from 'drizzle-orm';
import { recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { filePolicyViolation } from '../../files/file-errors.js';
import type { StorageAdapter } from '../../storage/storage-adapter.js';
import { onSiteAssignment, stintSubjectColumn } from '../fleet/on-site-assignment.js';
import { type DbOrTx, selectJobs } from '../jobs/job-load.js';
import { assertContractingMechanic, isMechanicRole } from '../mechanics.js';
import { breakdownDescriptor } from './breakdown-audit.js';
import {
  assertBreakdownAction,
  assertReportBreakdownJobAction,
  BreakdownError,
  breakdownNotFound,
  invalidMechanic,
  reportBreakdownRefused,
  tooManyBreakdownPhotos,
  withBreakdownConstraints,
} from './breakdown-errors.js';
import {
  breakdownActionSubject,
  breakdownReadableBy,
  breakdownReporter,
  breakdownSearchColumns,
  breakdownSubjectOf,
  breakdownSubjectRef,
  type LoadedBreakdown,
  loadReadableBreakdown,
  namedMechanics,
  selectBreakdowns,
  toBreakdownSummary,
} from './breakdown-load.js';

type Row = typeof contractingBreakdowns.$inferSelect;
type BreakdownPhoto = Row['photos'][number];

/** Photos a Breakdown write stores: the bytes and where they are kept. */
export type BreakdownEvidence = { storage: StorageAdapter; photos: Uint8Array[] };

const unsolved = inArray(contractingBreakdowns.status, [...unsolvedBreakdownStatuses]);
const photoNotFound = () => new BreakdownError('breakdown.not_found', 'Photo not found.');
const CANNOT_REPORT = 'You cannot report Breakdowns.';

/** Validates and stores every photo before the row is written; the caller deletes them if the write fails. */
async function storePhotos({ storage, photos }: BreakdownEvidence): Promise<BreakdownPhoto[]> {
  const validated = photos.map((bytes) => {
    const validation = validateFile(bytes, BREAKDOWN_PHOTO_POLICY);
    if (!validation.ok) throw filePolicyViolation(validation);
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

const breakdownSubjectColumn = (kind: BreakdownSubjectRef['kind']) =>
  kind === 'machine' ? contractingBreakdowns.machineId : contractingBreakdowns.implementId;

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
  if (jobId === undefined) return (await onSiteAssignment({ db: tx, subject }))?.jobId ?? null;
  const onSubject = eq(stintSubjectColumn(subject.kind), subject.id);
  const invalidJob = (message: string) => new BreakdownError('breakdown.invalid_job', message);
  const [job] = await tx
    .select({ status: contractingJobs.status, foremanUserId: contractingJobs.foremanUserId })
    .from(contractingJobs)
    .where(eq(contractingJobs.id, jobId))
    .for('share');
  if (!job) throw invalidJob('Choose an Upcoming or Active Job.');
  assertReportBreakdownJobAction(job, actor);
  const [stint] = await tx
    .select({ id: contractingMachineAssignments.id })
    .from(contractingMachineAssignments)
    .where(and(onSubject, eq(contractingMachineAssignments.jobId, jobId)))
    .limit(1);
  if (!stint) throw invalidJob(`This ${breakdownSubjectKindLabels[subject.kind]} is not on that Job.`);
  return jobId;
}

/** `created` is false when a retried `localId` returned the Breakdown already delivered. */
export type BreakdownReport = { breakdown: BreakdownDetail; created: boolean };

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
}): Promise<BreakdownReport> {
  const input = BreakdownReportInput.parse(raw);
  if (!hasPermission(actor, 'contracting_breakdown:report'))
    throw input.jobId
      ? reportBreakdownRefused('no-permission', CANNOT_REPORT)
      : new BreakdownError('breakdown.forbidden', CANNOT_REPORT);
  if ((evidence?.photos.length ?? 0) > BREAKDOWN_MAX_PHOTOS) throw tooManyBreakdownPhotos();
  // A phone retry of an already delivered report returns the stored Breakdown instead of a duplicate.
  async function replay(db: DbOrTx) {
    if (!input.localId) return null;
    const [row] = await db.select().from(contractingBreakdowns).where(eq(contractingBreakdowns.id, input.localId));
    if (!row) return null;
    const subject = breakdownSubjectRef(row);
    if (row.reportedByUserId !== actor.userId || subject.kind !== input.subject.kind || subject.id !== input.subject.id)
      throw new BreakdownError('breakdown.report_id_conflict', 'This report identifier has already been used.');
    return getBreakdown({ db, actor, id: row.id });
  }
  const delivered = await replay(db);
  if (delivered) return { breakdown: delivered, created: false };
  return withStoredPhotos<BreakdownReport>(evidence, (photos) =>
    withBreakdownConstraints(() =>
      db.transaction(async (tx) => {
        await lockSubject(tx, input.subject);
        const delivered = await replay(tx);
        if (delivered) return { result: { breakdown: delivered, created: false }, kept: false };
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
        return { result: { breakdown: await getBreakdown({ db: tx, actor, id: row.id }), created: true }, kept: true };
      }),
    ),
  );
}

async function toDetail(db: DbOrTx, actor: BreakdownActor, row: LoadedBreakdown): Promise<BreakdownDetail> {
  const { breakdown } = row;
  const hints = breakdown.jobId
    ? await selectBreakdowns(db)
        .where(
          and(eq(contractingBreakdowns.jobId, breakdown.jobId), ne(contractingBreakdowns.id, breakdown.id), unsolved),
        )
        .orderBy(desc(contractingBreakdowns.reportedAt))
    : [];
  return BreakdownDetail.parse({
    ...toBreakdownSummary(row),
    solvedByName: row.solvedByName,
    description: breakdown.description,
    latitude: breakdown.latitude,
    longitude: breakdown.longitude,
    photos: breakdown.photos,
    closeOutNote: breakdown.closeOutNote,
    dispatchHints: hints.map((hint) => ({
      breakdownId: hint.breakdown.id,
      subject: breakdownSubjectOf(hint),
      urgency: hint.breakdown.urgency,
      status: hint.breakdown.status,
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
    input.urgencies.length ? inArray(contractingBreakdowns.urgency, input.urgencies) : undefined,
    or(
      input.machineIds.length ? inArray(contractingBreakdowns.machineId, input.machineIds) : undefined,
      input.implementIds.length ? inArray(contractingBreakdowns.implementId, input.implementIds) : undefined,
    ),
    input.jobIds.length ? inArray(contractingBreakdowns.jobId, input.jobIds) : undefined,
    input.farmIds.length ? inArray(contractingJobs.farmId, input.farmIds) : undefined,
    input.reporterUserIds.length ? inArray(contractingBreakdowns.reportedByUserId, input.reporterUserIds) : undefined,
    onCalendarDays(contractingBreakdowns.reportedAt, JOHANNESBURG_TIME_ZONE, {
      from: input.reportedFrom,
      to: input.reportedTo,
    }),
    input.mechanicUserIds.length
      ? inArray(contractingBreakdowns.primaryMechanicUserId, input.mechanicUserIds)
      : undefined,
    breakdownReadableBy(actor),
    createGlobalSearchCondition(input.search, breakdownSearchColumns),
  );
  const matching = () =>
    selectBreakdowns(db)
      .where(where)
      .orderBy(...breakdownListOrder(input));
  const { rows, total, nextCursor } = await paginateWithWindowTotal(matching, input);
  const items = rows.map(toBreakdownSummary);
  return { items, nextCursor, total };
}

/**
 * The subjects, Jobs, Farms, reporters and primary Mechanics the actor's readable Breakdowns carry, for the Workshop's
 * column filters. Mechanics include anyone named on a Breakdown, so a filter on someone whose role changed still has a name.
 */
export async function listBreakdownFilterOptions({
  db,
  actor,
}: {
  db: Db;
  actor: BreakdownActor;
}): Promise<BreakdownFilterOptions> {
  const readable = breakdownReadableBy(actor);
  const subjectKind = sql<string>`case when ${contractingBreakdowns.machineId} is null then 'implement' else 'machine' end`;
  const subjectId = sql<string>`coalesce(${contractingBreakdowns.machineId}, ${contractingBreakdowns.implementId})`;
  const subjectCode = sql<string>`coalesce(${contractingMachines.code}, ${contractingImplements.code})`;
  const [subjects, jobs, farms, reporters, mechanics] = await Promise.all([
    db
      .selectDistinct({ kind: subjectKind, id: subjectId, code: subjectCode })
      .from(contractingBreakdowns)
      .leftJoin(contractingMachines, eq(contractingMachines.id, contractingBreakdowns.machineId))
      .leftJoin(contractingImplements, eq(contractingImplements.id, contractingBreakdowns.implementId))
      .where(readable)
      .orderBy(asc(subjectCode)),
    db
      .selectDistinct({ id: contractingJobs.id, code: contractingJobs.code })
      .from(contractingBreakdowns)
      .innerJoin(contractingJobs, eq(contractingJobs.id, contractingBreakdowns.jobId))
      .where(readable)
      .orderBy(asc(contractingJobs.code)),
    db
      .selectDistinct({ id: contractingFarms.id, name: contractingFarms.name })
      .from(contractingBreakdowns)
      .innerJoin(contractingJobs, eq(contractingJobs.id, contractingBreakdowns.jobId))
      .innerJoin(contractingFarms, eq(contractingFarms.id, contractingJobs.farmId))
      .where(readable)
      .orderBy(asc(contractingFarms.name)),
    db
      .selectDistinct({ id: breakdownReporter.id, name: breakdownReporter.name })
      .from(contractingBreakdowns)
      .innerJoin(breakdownReporter, eq(breakdownReporter.id, contractingBreakdowns.reportedByUserId))
      .where(readable)
      .orderBy(asc(breakdownReporter.name)),
    namedMechanics(db, readable),
  ]);
  return BreakdownFilterOptions.parse({
    subjects,
    jobs: jobs.map((job) => ({ id: job.id, jobNumber: formatJobNumber(job.code) })),
    farms,
    reporters,
    mechanics,
  });
}

/** The workshop queue's counts across every Breakdown the actor may read. */
export async function summarizeBreakdownQueue({
  db,
  actor,
}: {
  db: Db;
  actor: BreakdownActor;
}): Promise<BreakdownQueueSummary> {
  const rows = await db
    .select({
      status: contractingBreakdowns.status,
      count: sql<number>`count(*)::integer`,
      codeRed: sql<number>`count(*) filter (where ${contractingBreakdowns.urgency} = 'code-red')::integer`,
    })
    .from(contractingBreakdowns)
    .where(breakdownReadableBy(actor))
    .groupBy(contractingBreakdowns.status);
  const of = (status: BreakdownStatus) => rows.find((row) => row.status === status);
  return BreakdownQueueSummary.parse({
    counts: Object.fromEntries(breakdownStatuses.map((status) => [status, of(status)?.count ?? 0])),
    codeRedUnsolved: unsolvedBreakdownStatuses.reduce((total, status) => total + (of(status)?.codeRed ?? 0), 0),
  });
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

/** Locks a Breakdown and refuses unless this actor may take this Breakdown Action on it now. */
export async function lockBreakdownFor(
  tx: DatabaseTransaction,
  id: string,
  action: BreakdownActionName,
  actor: BreakdownActor,
) {
  const [before] = await tx.select().from(contractingBreakdowns).where(eq(contractingBreakdowns.id, id)).for('update');
  if (!before) throw breakdownNotFound();
  await assertActionOn(tx, action, before, actor);
  return before;
}

/**
 * An audited write to one Breakdown, gated by a Breakdown Action under the row lock; answers the fresh detail.
 * What `assert` resolves under the lock reaches `set`, as `mutateEntity` hands it on.
 */
function writeBreakdown<TPrepared = void>({
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
  assert?: (tx: DatabaseTransaction, before: Row) => Promise<TPrepared>;
  set: (before: Row, prepared: TPrepared) => Partial<typeof contractingBreakdowns.$inferInsert>;
}) {
  return withBreakdownConstraints(() =>
    mutateEntity<typeof contractingBreakdowns, BreakdownDetail, TPrepared>({
      db,
      actorUserId: actor.userId,
      descriptor: breakdownDescriptor,
      table: contractingBreakdowns,
      id,
      notFound: breakdownNotFound,
      assert: async (tx, before) => {
        await assertActionOn(tx, action, before, actor);
        return (await assert?.(tx, before)) as TPrepared;
      },
      set: (before, prepared) => ({ ...set(before, prepared), updatedAt: new Date() }),
      project: (tx, row) => getBreakdown({ db: tx, actor, id: row.id }),
    }),
  );
}

/** Answers whether the write escalated the Breakdown from Code Green to Code Red, which alerts as Code Red again. */
export async function patchBreakdown({
  db,
  actor,
  input: raw,
}: {
  db: Db;
  actor: BreakdownActor;
  input: BreakdownPatchInput;
}): Promise<{ breakdown: BreakdownDetail; escalated: boolean }> {
  const input = BreakdownPatchInput.parse(raw);
  let escalated = false;
  const breakdown = await writeBreakdown({
    db,
    actor,
    id: input.id,
    action: 'editReport',
    assert: (tx, before) => {
      escalated = before.urgency === 'code-green' && input.urgency === 'code-red';
      return input.jobId === undefined || input.jobId === before.jobId
        ? Promise.resolve(before.jobId)
        : resolveJob(tx, actor, breakdownSubjectRef(before), input.jobId);
    },
    set: (before, jobId) => ({
      description: input.description ?? before.description,
      urgency: input.urgency ?? before.urgency,
      jobId,
    }),
  });
  return { breakdown, escalated };
}

export async function assignMechanic({
  db,
  actor,
  input: raw,
  now = new Date(),
}: {
  db: Db;
  actor: BreakdownActor;
  input: BreakdownAssignMechanicInput;
  now?: Date;
}): Promise<BreakdownDetail> {
  const input = BreakdownAssignMechanicInput.parse(raw);
  return writeBreakdown({
    db,
    actor,
    id: input.id,
    action: 'assignMechanic',
    assert: async (tx) => {
      if (input.mechanicUserId) await assertContractingMechanic(tx, input.mechanicUserId, invalidMechanic);
    },
    // Only a change is an assignment: naming the same Mechanic again stamps nothing and stays a no-op.
    set: (before) =>
      before.primaryMechanicUserId === input.mechanicUserId
        ? {}
        : {
            primaryMechanicUserId: input.mechanicUserId,
            mechanicAssignedAt: now,
            mechanicAssignedByUserId: actor.userId,
          },
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
  if (evidence.photos.length > BREAKDOWN_MAX_PHOTOS) throw tooManyBreakdownPhotos();
  return withStoredPhotos(evidence, async (photos) => ({
    result: await writeBreakdown({
      db,
      actor,
      id,
      action: 'addPhotos',
      assert: async (_tx, before) => {
        if (before.photos.length + photos.length > BREAKDOWN_MAX_PHOTOS) throw tooManyBreakdownPhotos();
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
  const photo = await getBreakdownPhoto({ db, actor, id: input.id, photoId: input.photoId });
  const detail = await writeBreakdown({
    db,
    actor,
    id: input.id,
    action: 'addPhotos',
    assert: async (_tx, before) => {
      if (!before.photos.some((candidate) => candidate.id === photo.id)) throw photoNotFound();
    },
    set: (before) => ({ photos: before.photos.filter((candidate) => candidate.id !== photo.id) }),
  });
  await storage.deleteObject(photo.storageKey);
  return detail;
}

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
  if (!photo) throw photoNotFound();
  return photo;
}

/**
 * The Jobs `resolveJob` would accept for this subject: open, with the subject planned or on site on it, and for
 * someone who reads only their own Breakdowns, a Job they are Foreman of.
 */
export async function listBreakdownJobOptions({
  db,
  actor,
  subject,
}: {
  db: Db;
  actor: BreakdownActor;
  subject: BreakdownSubjectRef;
}): Promise<BreakdownJobOption[]> {
  const rows = await db
    .selectDistinct({ id: contractingJobs.id, code: contractingJobs.code, farmName: contractingFarms.name })
    .from(contractingMachineAssignments)
    .innerJoin(contractingJobs, eq(contractingJobs.id, contractingMachineAssignments.jobId))
    .innerJoin(contractingFarms, eq(contractingFarms.id, contractingJobs.farmId))
    .where(
      and(
        eq(stintSubjectColumn(subject.kind), subject.id),
        inArray(contractingJobs.status, [...openJobStatuses]),
        breakdownReadScope(actor) === 'own' ? eq(contractingJobs.foremanUserId, actor.userId) : undefined,
      ),
    )
    .orderBy(asc(contractingJobs.code));
  return rows.map((row) =>
    BreakdownJobOption.parse({ id: row.id, jobNumber: formatJobNumber(row.code), farmName: row.farmName }),
  );
}

/**
 * What a report screen shows before the person types, open to every reporter: the Job the report files on when it
 * names none (with that Job's names only for a reader who may open it), and the subject's unsolved Breakdowns.
 */
export async function getBreakdownReportContext({
  db,
  actor,
  subject,
}: {
  db: Db;
  actor: BreakdownActor;
  subject: BreakdownSubjectRef;
}): Promise<BreakdownReportContext> {
  const [onSite, open] = await Promise.all([
    onSiteAssignment({ db, subject }),
    selectBreakdowns(db)
      .where(and(eq(breakdownSubjectColumn(subject.kind), subject.id), unsolved))
      .orderBy(desc(contractingBreakdowns.reportedAt)),
  ]);
  /**
   * The Job's names for a reader who may see them, judged on the same row the names come from, so a Foreman
   * reassigned since the on-site read is neither shown stale names nor refused fresh ones.
   */
  const visibleJobNames = async (jobId: string) => {
    const [header] = await selectJobs(db).where(eq(contractingJobs.id, jobId));
    if (!header || !fieldReaderSeesJob(actor, header.job)) return null;
    return {
      id: jobId,
      customerName: header.customerName,
      farmName: header.farmName,
      workTypeName: header.workTypeName,
    };
  };
  return BreakdownReportContext.parse({
    defaultJob: onSite
      ? {
          jobNumber: formatJobNumber(onSite.jobCode),
          job: await visibleJobNames(onSite.jobId),
        }
      : null,
    open: open.map(toBreakdownSummary),
  });
}

/** Refuses a role or device change that would strand a Mechanic's unsolved Breakdowns or open Service Records. */
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
  if ((contractingRole === undefined || isMechanicRole(contractingRole)) && isDevice !== true) return;
  const [[breakdown], [serviceRecord]] = await Promise.all([
    db
      .select({ id: contractingBreakdowns.id })
      .from(contractingBreakdowns)
      .where(and(eq(contractingBreakdowns.primaryMechanicUserId, userId), unsolved))
      .limit(1),
    db
      .select({ id: contractingServiceRecords.id })
      .from(contractingServiceRecords)
      .where(
        and(eq(contractingServiceRecords.primaryMechanicUserId, userId), isNull(contractingServiceRecords.closedAt)),
      )
      .limit(1),
  ]);
  if (breakdown || serviceRecord)
    throw new BreakdownError(
      'breakdown.invalid_mechanic',
      "Reassign this mechanic's Breakdowns that are not yet Fixed and open Service Records before changing their role.",
    );
}
