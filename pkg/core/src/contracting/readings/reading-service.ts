import { type DatabaseTransaction, type Db, user, withPagination } from '@pkg/db';
import {
  contractingCategories,
  contractingHourReadings,
  contractingJobs,
  contractingMachineAssignments,
  contractingMachines,
} from '@pkg/db/contracting';
import { groupBy, hasPermission } from '@pkg/domain';
import {
  amendmentJobs,
  assignmentState,
  type CaptureAttempt,
  type CaptureNeighbour,
  type CaptureWorld,
  captureCrossesServiceDueSoon,
  contradictingTelematics,
  disputeGroupReason,
  earliestReadAtFor,
  effectiveServiceAlertHours,
  FUTURE_READ_AT_TOLERANCE_MS,
  formatJobNumber,
  groupDisputes,
  isReported,
  type JobActor,
  judgeCapture,
  ledgerOrder,
  NEXT_CAPTURE_DISPUTES,
  PREVIOUS_READING_WRONG,
  proposesReadAt,
  type ReportNeighbour,
  resolveReadingAmendments,
  suggestReadAt,
  type ValueBracket,
} from '@pkg/domain/contracting';
import { getNextCursor } from '@pkg/schema';
import {
  FieldReading,
  type FieldReadingPageInput,
  LatestReading,
  ReadAtSuggestion,
  ReadingAmendInput,
  ReadingCaptureInput,
} from '@pkg/schema/contracting';
import { and, asc, eq, getTableColumns, gt, inArray, isNotNull, lte, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { recordAuditCreate } from '../../audit/audit-writer.js';
import { reopenPricingWithin } from '../jobs/pricing-service.js';
import { getContractingSettings } from '../settings/settings-service.js';
import { attachReadingToStint, resolveCaptureStint } from './capture-stint.js';
import { type ReadingRow as Row, readingDescriptor, updateAudited } from './reading-audit.js';
import {
  amendmentRefused,
  assertAmendReadings,
  readingNotFound as notFound,
  ReadingError,
  withCaptureConstraints,
} from './reading-errors.js';
import { newestFirst, oldestFirst } from './reading-sql.js';
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
      row.role !== input.role ||
      row.capturedAt.getTime() !== Date.parse(input.capturedAt)
    )
      throw new ReadingError('reading.capture_id_conflict', 'This capture identifier has already been used.');
    return { reading: row, serviceDueSoonCrossed: false };
  }
  const delivered = await replay(db);
  if (delivered) return delivered;
  return withCaptureConstraints(() =>
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
      const neighbours: Pick<CaptureWorld, 'latest' | 'previous' | 'next' | 'previousTelematics' | 'nextTelematics'> = {
        latest: latest ? { id: latest.id, value: latest.value } : null,
        previous: previous ? toNeighbour(previous) : null,
        next: next ? toNeighbour(next) : null,
        previousTelematics: previousTelematics ? toNeighbour(previousTelematics) : null,
        nextTelematics: nextTelematics ? toNeighbour(nextTelematics) : null,
      };
      const world: CaptureWorld = {
        ...neighbours,
        stint: stint ? assignmentState(stint.stint) : null,
        stintArrivedAt: stintArrival?.capturedAt ?? null,
        lastDepartedAt: lastDeparture?.capturedAt ?? null,
        jobVerdict: stint?.jobVerdict ?? null,
        mayBaseline: hasPermission(actor, 'contracting_reading:capture-baseline'),
        machineRetired: machine.retiredAt !== null,
        implementValid: stint?.implementValid ?? true,
        driverValid: stint?.driverValid ?? true,
        now,
        futureToleranceMs: FUTURE_READ_AT_TOLERANCE_MS,
      };
      const attempt: CaptureAttempt = {
        role: input.role,
        value: input.value,
        readAt,
        disputePrevious: input.disputePrevious,
        expectedPreviousId: input.expectedPreviousId,
      };
      const judgement = judgeCapture(world, attempt);
      if (!judgement.ok) {
        // Only a value refusal proposes a Read At, so only one reads the Telematics Readings bracketing the value.
        const suggestion = proposesReadAt(judgement.rule)
          ? suggestReadAt(
              input.value,
              await valueBracketFor(tx, input.machineId, input.value),
              earliestReadAtFor(input.role, world),
            )
          : null;
        throw new ReadingError(judgement.reason, judgement.message, {
          refused: judgement.refused,
          suggestedReadAt: suggestion ? ReadAtSuggestion.parse(suggestion) : undefined,
        });
      }
      const disputed = judgement.disputes !== null;
      if (disputed && latest)
        await updateAudited(tx, actorUserId, latest, {
          disputed: true,
          disputeReason: NEXT_CAPTURE_DISPUTES,
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
          method: 'manual',
          comment: input.comment ?? null,
          disputed,
          disputedPreviousId: judgement.disputes,
          disputeReason: disputed ? PREVIOUS_READING_WRONG : null,
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
        reading: row,
        serviceDueSoonCrossed: captureCrossesServiceDueSoon(neighbours, {
          newHours: row.value,
          nextServiceDueHours: machine.nextServiceDueHours,
          threshold: effectiveServiceAlertHours(machine, serviceDueSoonThresholdHours),
        }),
      };
    }),
  );
}

/**
 * The Telematics Readings `value` falls between. Every report after the floor reads above the value, so the ceiling
 * is the next one.
 */
async function valueBracketFor(tx: DatabaseTransaction, machineId: string, value: number): Promise<ValueBracket> {
  const onMachine = and(eq(contractingHourReadings.machineId, machineId), isTelematics);
  const [floor] = await tx
    .select()
    .from(contractingHourReadings)
    .where(and(onMachine, lte(contractingHourReadings.value, value)))
    .orderBy(...newestFirst)
    .limit(1);
  if (!floor) return { floor: null, ceiling: null };
  const [ceiling] =
    floor.value === value
      ? []
      : await tx
          .select()
          .from(contractingHourReadings)
          .where(and(onMachine, gt(contractingHourReadings.capturedAt, floor.capturedAt)))
          .orderBy(...oldestFirst)
          .limit(1);
  return {
    floor: toReport(floor),
    ceiling: ceiling ? { ...toReport(ceiling), createdAt: ceiling.createdAt } : null,
  };
}

const toReport = (row: Row): ReportNeighbour => {
  const neighbour = toNeighbour(row);
  if (!isReported(neighbour)) throw new Error('A value bracket holds Telematics Readings only');
  return neighbour;
};

const toNeighbour = ({ id, role, value, capturedAt, telematicsProvider }: Row): CaptureNeighbour => ({
  id,
  role,
  value,
  capturedAt,
  telematicsProvider,
});

const capturer = alias(user, 'dispute_capturer');
const stintAssignment = alias(contractingMachineAssignments, 'dispute_stint');
const stintArrival = alias(contractingHourReadings, 'dispute_stint_arrival');
const stintDeparture = alias(contractingHourReadings, 'dispute_stint_departure');

/**
 * Disputes, newest first: each a connected group of Disputed readings on one Machine, with the Telematics Reading it
 * contradicts.
 */
export async function listDisputes({ db }: { db: Db }) {
  const rows = await db
    .select({
      ...getTableColumns(contractingHourReadings),
      machineCode: contractingMachines.code,
      categoryIcon: contractingCategories.icon,
      categoryColour: contractingCategories.colour,
      capturedByName: capturer.name,
      assignmentId: stintAssignment.id,
      jobId: contractingJobs.id,
      jobCode: contractingJobs.code,
      arrivedAt: stintArrival.capturedAt,
      departedAt: stintDeparture.capturedAt,
    })
    .from(contractingHourReadings)
    .innerJoin(contractingMachines, eq(contractingMachines.id, contractingHourReadings.machineId))
    .innerJoin(contractingCategories, eq(contractingCategories.id, contractingMachines.categoryId))
    .leftJoin(capturer, eq(capturer.id, contractingHourReadings.capturedByUserId))
    .leftJoin(
      stintAssignment,
      or(
        eq(stintAssignment.arrivalReadingId, contractingHourReadings.id),
        eq(stintAssignment.departureReadingId, contractingHourReadings.id),
      ),
    )
    .leftJoin(contractingJobs, eq(contractingJobs.id, stintAssignment.jobId))
    .leftJoin(stintArrival, eq(stintArrival.id, stintAssignment.arrivalReadingId))
    .leftJoin(stintDeparture, eq(stintDeparture.id, stintAssignment.departureReadingId))
    .where(eq(contractingHourReadings.disputed, true))
    .orderBy(...newestFirst);
  const disputedByMachine = groupBy(
    rows.map(({ jobId, jobCode, arrivedAt, departedAt, ...row }) => ({
      ...row,
      stint:
        row.assignmentId && jobId && jobCode !== null
          ? { assignmentId: row.assignmentId, jobId, jobNumber: formatJobNumber(jobCode), arrivedAt, departedAt }
          : null,
    })),
    (row) => row.machineId,
  );
  // A Dispute's report is the nearest Telematics Reading it contradicts, so only reports are read.
  const reports = disputedByMachine.size
    ? await db
        .select({
          id: contractingHourReadings.id,
          machineId: contractingHourReadings.machineId,
          value: contractingHourReadings.value,
          capturedAt: contractingHourReadings.capturedAt,
          sequence: contractingHourReadings.sequence,
          telematicsProvider: contractingHourReadings.telematicsProvider,
        })
        .from(contractingHourReadings)
        .where(and(inArray(contractingHourReadings.machineId, [...disputedByMachine.keys()]), isTelematics))
    : [];
  const reportsByMachine = groupBy(reports, (report) => report.machineId);
  const disputes = [...disputedByMachine].flatMap(([machineId, disputed]) =>
    groupDisputes(disputed).map((group) => {
      const [first] = group;
      const reported = contradictingTelematics(
        [...(reportsByMachine.get(machineId) ?? []), ...group],
        group.map((reading) => reading.id),
      );
      return {
        id: first.id,
        machineId,
        machineCode: first.machineCode,
        categoryIcon: first.categoryIcon,
        categoryColour: first.categoryColour,
        readings: group,
        reported,
        reason: disputeGroupReason(group, reported),
      };
    }),
  );
  return disputes.sort((left, right) => ledgerOrder(right.readings[0], left.readings[0]));
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
    const jobs = amendmentJobs(rows, amendments, stints);
    const affected = await lockJobs(tx, jobs.bound);
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
              amendedBy: actorUserId,
              amendedAt: now,
              amendmentReason: input.reason,
            }
          : {}),
      });
    }
    // Only a Job whose hours moved returns to Completed: a settled Dispute moves none.
    for (const job of affected.filter((candidate) => candidate.status === 'priced' && jobs.moved.has(candidate.id)))
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
    const byId = new Map(amended.map((row) => [row.id, row]));
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

/** The Jobs an amendment touches, locked after the Machine in id order. */
async function lockJobs(tx: DatabaseTransaction, jobIds: ReadonlySet<string>) {
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
  return row;
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
    .select({ ...getTableColumns(contractingHourReadings), capturedByName: user.name })
    .from(contractingHourReadings)
    .leftJoin(user, eq(user.id, contractingHourReadings.capturedByUserId))
    .where(onMachine)
    .orderBy(...newestFirst)
    .$dynamic();
  const [rows, total] = await Promise.all([
    withPagination(query, input),
    db.$count(contractingHourReadings, onMachine),
  ]);
  return {
    items: rows.map(({ capturedByName, ...row }) => FieldReading.parse({ ...readingToWire(row), capturedByName })),
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  };
}
