import { createGlobalSearchCondition, type Db, user } from '@pkg/db';
import {
  contractingBreakdownNotes,
  contractingBreakdowns,
  contractingCategories,
  contractingCustomers,
  contractingFarms,
  contractingHourReadings,
  contractingImplements,
  contractingJobNotes,
  contractingJobs,
  contractingMachineAssignments,
  contractingMachines,
} from '@pkg/db/contracting';
import {
  activityItemCategory,
  breakdownFirstLine,
  breakdownReadScope,
  canSeeActivity,
  formatJobNumber,
  JOB_NUMBER_DIGITS,
  JOB_NUMBER_PREFIX,
  type JobActor,
  jobReadMode,
} from '@pkg/domain/contracting';
import {
  ActivityCursor,
  ActivityItem,
  type ActivityItemType,
  type ActivityJobRef,
  type ActivityListInput,
  type ActivityListResult,
  type ActivityMachineRef,
} from '@pkg/schema/contracting';
import { and, eq, inArray, isNotNull, ne, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';
import {
  breakdownReadableBy,
  breakdownSubjectOf,
  type LoadedBreakdown,
  selectBreakdowns,
} from '../breakdowns/breakdown-load.js';
import { readableBy, readerFor } from '../jobs/job-readers.js';
import { ActivityError } from './activity-errors.js';

/**
 * The Contracting Activity feed: one keyset-paged stream read off the records themselves (ADR 0023). Each item type
 * is one branch of a `union all` over its own `(stamp, id)` index, so a page is a merge of indexed walks that stops at
 * the limit; nothing counts the union and nothing offsets into it.
 */

type ActivityKey = { id: string; type: ActivityItemType; occurredAt: Date; cursorAt: string };

type Branch = {
  type: ActivityItemType;
  /** The row the item is, its stamp, and everything the branch filters on, as one select. */
  select: (where: (row: BranchRow) => SQL | undefined) => { getSQL(): SQL };
};
type BranchRow = { id: PgColumn; stamp: PgColumn };

const searchJob = alias(contractingJobs, 'activity_search_job');
const searchFarm = alias(contractingFarms, 'activity_search_farm');
const searchCustomer = alias(contractingCustomers, 'activity_search_customer');
const searchBreakdown = alias(contractingBreakdowns, 'activity_search_breakdown');
const searchMachine = alias(contractingMachines, 'activity_search_machine');
const searchImplement = alias(contractingImplements, 'activity_search_implement');
const searchMechanic = alias(user, 'activity_search_mechanic');
const searchUser = alias(user, 'activity_search_user');

const nothing = sql`false`;

/** A person named on the item by id, matched by name. */
const userMatches = (userId: SQLWrapper, search: string) => sql`exists (
  select 1 from ${user} ${searchUser}
  where ${searchUser.id} = ${userId}
    and ${createGlobalSearchCondition(search, [sql`${searchUser.name}`]) ?? nothing}
)`;

/** A Job matched by its Job Number, Farm or Customer. */
const jobMatches = (jobId: SQLWrapper, search: string) => sql`exists (
  select 1 from ${contractingJobs} ${searchJob}
  inner join ${contractingFarms} ${searchFarm} on ${searchFarm.id} = ${searchJob.farmId}
  inner join ${contractingCustomers} ${searchCustomer} on ${searchCustomer.id} = ${searchJob.customerId}
  where ${searchJob.id} = ${jobId}
    and ${
      createGlobalSearchCondition(search, [
        sql`${JOB_NUMBER_PREFIX} || lpad(${searchJob.code}::text, greatest(${JOB_NUMBER_DIGITS}, length(${searchJob.code}::text)), '0')`,
        sql`${searchFarm.name}`,
        sql`${searchCustomer.name}`,
      ]) ?? nothing
    }
)`;

/** A Machine matched by its code. */
const machineMatches = (machineId: SQLWrapper, search: string) => sql`exists (
  select 1 from ${contractingMachines} ${searchMachine}
  where ${searchMachine.id} = ${machineId}
    and ${createGlobalSearchCondition(search, [sql`${searchMachine.code}`]) ?? nothing}
)`;

/** A Breakdown matched by its subject's code, its Mechanic, or its Job. */
const breakdownMatches = (breakdownId: SQLWrapper, search: string) => sql`exists (
  select 1 from ${contractingBreakdowns} ${searchBreakdown}
  left join ${contractingMachines} ${searchMachine} on ${searchMachine.id} = ${searchBreakdown.machineId}
  left join ${contractingImplements} ${searchImplement} on ${searchImplement.id} = ${searchBreakdown.implementId}
  left join ${user} ${searchMechanic} on ${searchMechanic.id} = ${searchBreakdown.primaryMechanicUserId}
  where ${searchBreakdown.id} = ${breakdownId}
    and ${
      or(
        createGlobalSearchCondition(search, [
          sql`${searchMachine.code}`,
          sql`${searchImplement.code}`,
          sql`${searchMechanic.name}`,
        ]),
        jobMatches(searchBreakdown.jobId, search),
      ) ?? nothing
    }
)`;

/** The Machine whose arrival started a Job: the one a `job-started` item names. */
const firstArrivalMachine = (jobId: SQLWrapper) => sql`(
  select first_stint.machine_id
  from contracting.machine_assignment first_stint
  inner join contracting.hour_reading first_arrival on first_arrival.id = first_stint.arrival_reading_id
  where first_stint.job_id = ${jobId}
  order by first_arrival.created_at, first_arrival.id
  limit 1
)`;

const textMatches = (column: SQLWrapper, search: string) =>
  createGlobalSearchCondition(search, [sql`${column}`]) ?? nothing;

/** Notes and readings reach through their Job: the Job is readable, and (scoped) is the Job asked about. */
const throughJob = (jobId: SQLWrapper, reach: SQL | undefined, scope: SQL | undefined) => sql`exists (
  select 1 from ${contractingJobs}
  where ${contractingJobs.id} = ${jobId}
    and ${and(reach, scope) ?? sql`true`}
)`;

/** Breakdown Notes reach through their Breakdown in the same way. */
const throughBreakdown = (breakdownId: SQLWrapper, reach: SQL | undefined, scope: SQL | undefined) => sql`exists (
  select 1 from ${contractingBreakdowns}
  where ${contractingBreakdowns.id} = ${breakdownId}
    and ${and(reach, scope) ?? sql`true`}
)`;

function keySelect(db: Db, type: ActivityItemType, row: BranchRow) {
  return db.select({
    id: sql<string>`${row.id}`.as('id'),
    occurredAt: sql<Date>`${row.stamp}`.as('occurred_at'),
    type: sql<ActivityItemType>`${sql.raw(`'${type}'`)}::text`.as('type'),
  });
}

/** The keyset: strictly after the cursor in `(stamp, id) desc`, as a row comparison each branch's index serves. */
const afterCursor = (input: ActivityListInput) => (row: BranchRow) =>
  input.cursor
    ? sql`(${row.stamp}, ${row.id}) < (${input.cursor.occurredAt}::timestamptz, ${input.cursor.id}::uuid)`
    : undefined;

function branches(db: Db, actor: JobActor, input: ActivityListInput): Branch[] {
  const search = input.search || undefined;
  const jobReach = jobReadMode(actor) ? readableBy(readerFor(actor)) : null;
  const breakdownReach = breakdownReadScope(actor) ? { where: breakdownReadableBy(actor) } : null;

  // `breakdownId` asks about one Breakdown, so the Job-side branches drop out; `jobId` keeps both sides on that Job.
  const jobSide = jobReach !== null && !input.breakdownId;
  const jobScope = input.jobId ? eq(contractingJobs.id, input.jobId) : undefined;
  const breakdownScope = and(
    input.jobId ? eq(contractingBreakdowns.jobId, input.jobId) : undefined,
    input.breakdownId ? eq(contractingBreakdowns.id, input.breakdownId) : undefined,
  );

  const jobBranch = (
    type: ActivityItemType,
    stamp: PgColumn,
    actorId: PgColumn,
    extra: SQL | undefined,
    matches: (search: string) => SQL | undefined,
  ): Branch => ({
    type,
    select: (where) => {
      const row = { id: contractingJobs.id, stamp };
      return keySelect(db, type, row)
        .from(contractingJobs)
        .where(
          and(
            isNotNull(stamp),
            extra,
            jobReach ?? undefined,
            jobScope,
            search
              ? or(jobMatches(contractingJobs.id, search), userMatches(actorId, search), matches(search))
              : undefined,
            where(row),
          ),
        );
    },
  });

  const breakdownBranch = (
    type: ActivityItemType,
    stamp: PgColumn,
    actorId: PgColumn,
    extra: SQL | undefined,
    matches: (search: string) => SQL | undefined,
  ): Branch => ({
    type,
    select: (where) => {
      const row = { id: contractingBreakdowns.id, stamp };
      return keySelect(db, type, row)
        .from(contractingBreakdowns)
        .where(
          and(
            isNotNull(stamp),
            extra,
            breakdownReach?.where,
            breakdownScope,
            search
              ? or(breakdownMatches(contractingBreakdowns.id, search), userMatches(actorId, search), matches(search))
              : undefined,
            where(row),
          ),
        );
    },
  });

  const readingBranch = (type: 'machine-arrived' | 'machine-left', stintColumn: PgColumn): Branch => ({
    type,
    select: (where) => {
      const row = { id: contractingHourReadings.id, stamp: contractingHourReadings.createdAt };
      return keySelect(db, type, row)
        .from(contractingHourReadings)
        .innerJoin(contractingMachineAssignments, eq(stintColumn, contractingHourReadings.id))
        .where(
          and(
            throughJob(contractingMachineAssignments.jobId, jobReach ?? undefined, jobScope),
            search
              ? or(
                  jobMatches(contractingMachineAssignments.jobId, search),
                  machineMatches(contractingHourReadings.machineId, search),
                  userMatches(contractingHourReadings.capturedByUserId, search),
                )
              : undefined,
            where(row),
          ),
        );
    },
  });

  const all: (Branch | false)[] = [
    jobSide && {
      type: 'job-note',
      select: (where) => {
        const row = { id: contractingJobNotes.id, stamp: contractingJobNotes.createdAt };
        return keySelect(db, 'job-note', row)
          .from(contractingJobNotes)
          .where(
            and(
              throughJob(contractingJobNotes.jobId, jobReach ?? undefined, jobScope),
              search
                ? or(
                    textMatches(contractingJobNotes.text, search),
                    userMatches(contractingJobNotes.authorUserId, search),
                    jobMatches(contractingJobNotes.jobId, search),
                  )
                : undefined,
              where(row),
            ),
          );
      },
    },
    breakdownReach !== null && {
      type: 'breakdown-note',
      select: (where) => {
        const row = { id: contractingBreakdownNotes.id, stamp: contractingBreakdownNotes.createdAt };
        return keySelect(db, 'breakdown-note', row)
          .from(contractingBreakdownNotes)
          .where(
            and(
              throughBreakdown(contractingBreakdownNotes.breakdownId, breakdownReach.where, breakdownScope),
              search
                ? or(
                    textMatches(contractingBreakdownNotes.text, search),
                    userMatches(contractingBreakdownNotes.authorUserId, search),
                    breakdownMatches(contractingBreakdownNotes.breakdownId, search),
                  )
                : undefined,
              where(row),
            ),
          );
      },
    },
    breakdownReach !== null &&
      breakdownBranch(
        'breakdown-reported',
        contractingBreakdowns.reportedAt,
        contractingBreakdowns.reportedByUserId,
        undefined,
        (term) => textMatches(contractingBreakdowns.description, term),
      ),
    breakdownReach !== null &&
      breakdownBranch(
        'mechanic-assigned',
        contractingBreakdowns.mechanicAssignedAt,
        contractingBreakdowns.mechanicAssignedByUserId,
        undefined,
        () => undefined,
      ),
    // Solving straight from Not fixed stamps the start and the fix at one instant: that reads as one Fixed item.
    breakdownReach !== null &&
      breakdownBranch(
        'breakdown-started',
        contractingBreakdowns.startedAt,
        contractingBreakdowns.startedByUserId,
        or(
          sql`${contractingBreakdowns.solvedAt} is null`,
          ne(contractingBreakdowns.startedAt, contractingBreakdowns.solvedAt),
        ),
        () => undefined,
      ),
    breakdownReach !== null &&
      breakdownBranch(
        'breakdown-solved',
        contractingBreakdowns.solvedAt,
        contractingBreakdowns.solvedByUserId,
        undefined,
        (term) => textMatches(contractingBreakdowns.closeOutNote, term),
      ),
    jobSide &&
      jobBranch('job-started', contractingJobs.activatedAt, contractingJobs.activatedByUserId, undefined, (term) =>
        machineMatches(firstArrivalMachine(contractingJobs.id), term),
      ),
    jobSide &&
      jobBranch(
        'job-completed',
        contractingJobs.completedAt,
        contractingJobs.completedByUserId,
        undefined,
        () => undefined,
      ),
    jobSide &&
      jobBranch('job-cancelled', contractingJobs.cancelledAt, contractingJobs.cancelledByUserId, undefined, (term) =>
        textMatches(contractingJobs.cancellationReason, term),
      ),
    jobSide && readingBranch('machine-arrived', contractingMachineAssignments.arrivalReadingId),
    jobSide && readingBranch('machine-left', contractingMachineAssignments.departureReadingId),
  ];

  return all.filter(
    (branch): branch is Branch =>
      branch !== false && (input.filter === 'all' || activityItemCategory[branch.type] === input.filter),
  );
}

/**
 * The page query: one `union all` branch per live item type, merged newest first and cut at the limit. Null when the
 * caller reaches no branch the filter keeps. Exported for the plan test, which pins that no branch sorts.
 */
export function activityPageQuery(db: Db, actor: JobActor, input: ActivityListInput): SQL | null {
  const live = branches(db, actor, input);
  if (!live.length) return null;
  const keyset = afterCursor(input);
  // Each branch walks its own `(stamp, id)` index for at most a page, so the merge above them never sorts and never
  // reads more than a page per branch however long the history grows. Ordinals, because a leaf's ORDER BY names
  // its own output columns.
  const union = sql.join(
    live.map((branch) => sql`(${branch.select(keyset).getSQL()} order by 2 desc, 1 desc limit ${input.limit})`),
    sql` union all `,
  );
  // Microseconds, so the next page continues exactly below this row; the item's own `occurredAt` keeps the
  // milliseconds a Date can hold.
  return sql`
    select activity_keys.id, activity_keys.type,
      to_char(activity_keys.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at
    from (${union}) as activity_keys
    order by activity_keys.occurred_at desc, activity_keys.id desc
    limit ${input.limit}
  `;
}

/** One page of the stream as keys: which row, which type, and the exact stamp the next page continues below. */
async function findActivityKeys(db: Db, actor: JobActor, input: ActivityListInput): Promise<ActivityKey[]> {
  const query = activityPageQuery(db, actor, input);
  if (!query) return [];
  const rows = await db.execute<{ id: string; type: ActivityItemType; cursor_at: string }>(query);
  return [...rows].map((row) => ({
    id: row.id,
    type: row.type,
    occurredAt: new Date(row.cursor_at),
    cursorAt: row.cursor_at,
  }));
}

/** The page's items, hydrated per type in one query each, in the order the keys fixed. */
async function hydrateActivityKeys(db: Db, keys: ActivityKey[]): Promise<ActivityItem[]> {
  const idsOf = (...types: ActivityItemType[]) => keys.filter((key) => types.includes(key.type)).map((key) => key.id);
  const [jobNotes, breakdownNotes, readings, jobRows] = await Promise.all([
    findJobNotes(db, idsOf('job-note')),
    findBreakdownNotes(db, idsOf('breakdown-note')),
    findReadings(db, idsOf('machine-arrived', 'machine-left')),
    findJobRows(db, idsOf('job-started', 'job-completed', 'job-cancelled')),
  ]);
  const breakdownIds = [
    ...idsOf('breakdown-reported', 'mechanic-assigned', 'breakdown-started', 'breakdown-solved'),
    ...breakdownNotes.map((note) => note.breakdownId),
  ];
  const [breakdowns, firstArrivals] = await Promise.all([
    findBreakdowns(db, breakdownIds),
    findFirstArrivals(db, idsOf('job-started')),
  ]);
  const jobIds = [
    ...jobNotes.map((note) => note.jobId),
    ...readings.map((reading) => reading.jobId),
    ...jobRows.map((job) => job.id),
    ...breakdowns.flatMap((row) => (row.breakdown.jobId ? [row.breakdown.jobId] : [])),
  ];
  const machineIds = [
    ...readings.map((reading) => reading.machineId),
    ...firstArrivals.map((arrival) => arrival.machineId),
  ];
  const actorIds = [
    ...jobNotes.map((note) => note.authorUserId),
    ...breakdownNotes.map((note) => note.authorUserId),
    ...readings.map((reading) => reading.capturedByUserId),
    ...jobRows.flatMap((job) => [job.activatedByUserId, job.completedByUserId, job.cancelledByUserId]),
    ...breakdowns.flatMap((row) => [
      row.breakdown.reportedByUserId,
      row.breakdown.mechanicAssignedByUserId,
      row.breakdown.startedByUserId,
      row.breakdown.solvedByUserId,
    ]),
  ].filter((id): id is string => id !== null);
  const [jobRefs, machineRefs, actors] = await Promise.all([
    findJobRefs(db, jobIds),
    findMachineRefs(db, machineIds),
    findActors(db, actorIds),
  ]);

  const byId = <T extends { id: string }>(rows: readonly T[]) => new Map(rows.map((row) => [row.id, row]));
  const jobNoteById = byId(jobNotes);
  const breakdownNoteById = byId(breakdownNotes);
  const readingById = byId(readings);
  const jobRowById = byId(jobRows);
  const breakdownById = new Map(breakdowns.map((row) => [row.breakdown.id, row]));
  const firstArrivalByJob = new Map(firstArrivals.map((arrival) => [arrival.jobId, arrival]));
  const jobRefById = byId(jobRefs);
  const machineRefById = byId(machineRefs);
  const actorById = byId(actors);

  const found = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new Error(`Activity ${what} vanished between paging and hydration`);
    return value;
  };
  const actor = (id: string | null) => found(id === null ? undefined : actorById.get(id), `actor ${id}`);
  const job = (id: string) => found(jobRefById.get(id), `Job ${id}`);
  const machine = (id: string) => found(machineRefById.get(id), `Machine ${id}`);
  const breakdownRef = (row: LoadedBreakdown) => ({
    breakdown: {
      id: row.breakdown.id,
      urgency: row.breakdown.urgency,
      status: row.breakdown.status,
      subject: breakdownSubjectOf(row),
      jobId: row.breakdown.jobId,
    },
    job: row.breakdown.jobId ? job(row.breakdown.jobId) : null,
  });

  const toItem = (key: ActivityKey): ActivityItem => {
    const at = { id: key.id, occurredAt: key.occurredAt.toISOString() };
    switch (key.type) {
      case 'job-note': {
        const note = found(jobNoteById.get(key.id), `Job Note ${key.id}`);
        return ActivityItem.parse({
          type: key.type,
          ...at,
          actor: actor(note.authorUserId),
          job: job(note.jobId),
          text: note.text,
        });
      }
      case 'breakdown-note': {
        const note = found(breakdownNoteById.get(key.id), `Breakdown Note ${key.id}`);
        const row = found(breakdownById.get(note.breakdownId), `Breakdown ${note.breakdownId}`);
        return ActivityItem.parse({
          type: key.type,
          ...at,
          actor: actor(note.authorUserId),
          ...breakdownRef(row),
          text: note.text,
        });
      }
      case 'breakdown-reported':
      case 'mechanic-assigned':
      case 'breakdown-started':
      case 'breakdown-solved': {
        const row = found(breakdownById.get(key.id), `Breakdown ${key.id}`);
        const shared = { type: key.type, ...at, ...breakdownRef(row) };
        if (key.type === 'breakdown-reported')
          return ActivityItem.parse({
            ...shared,
            actor: actor(row.breakdown.reportedByUserId),
            firstLine: breakdownFirstLine(row.breakdown.description),
          });
        if (key.type === 'mechanic-assigned')
          return ActivityItem.parse({
            ...shared,
            actor: actor(row.breakdown.mechanicAssignedByUserId),
            mechanicName: row.mechanicName,
          });
        if (key.type === 'breakdown-started')
          return ActivityItem.parse({ ...shared, actor: actor(row.breakdown.startedByUserId) });
        return ActivityItem.parse({
          ...shared,
          actor: actor(row.breakdown.solvedByUserId),
          closeOutNote: row.breakdown.closeOutNote,
        });
      }
      case 'job-started':
      case 'job-completed':
      case 'job-cancelled': {
        const row = found(jobRowById.get(key.id), `Job ${key.id}`);
        const shared = { type: key.type, ...at, job: job(row.id) };
        if (key.type === 'job-started') {
          const arrival = found(firstArrivalByJob.get(row.id), `first arrival on Job ${row.id}`);
          return ActivityItem.parse({
            ...shared,
            actor: actor(row.activatedByUserId),
            machine: machine(arrival.machineId),
          });
        }
        if (key.type === 'job-completed') return ActivityItem.parse({ ...shared, actor: actor(row.completedByUserId) });
        return ActivityItem.parse({
          ...shared,
          actor: actor(row.cancelledByUserId),
          reason: row.cancellationReason ?? '',
        });
      }
      case 'machine-arrived':
      case 'machine-left': {
        const reading = found(readingById.get(key.id), `Hour Reading ${key.id}`);
        return ActivityItem.parse({
          type: key.type,
          ...at,
          actor: actor(reading.capturedByUserId),
          job: job(reading.jobId),
          machine: machine(reading.machineId),
          hours: reading.value,
          readAt: reading.capturedAt.toISOString(),
          photoBacked: reading.method === 'photo',
        });
      }
    }
  };
  return keys.map(toItem);
}

const unique = (ids: readonly string[]) => [...new Set(ids)];

function findJobNotes(db: Db, ids: string[]) {
  return ids.length
    ? db.select().from(contractingJobNotes).where(inArray(contractingJobNotes.id, ids))
    : Promise.resolve([]);
}

function findBreakdownNotes(db: Db, ids: string[]) {
  return ids.length
    ? db.select().from(contractingBreakdownNotes).where(inArray(contractingBreakdownNotes.id, ids))
    : Promise.resolve([]);
}

function findReadings(db: Db, ids: string[]) {
  return ids.length
    ? db
        .select({
          id: contractingHourReadings.id,
          machineId: contractingHourReadings.machineId,
          value: contractingHourReadings.value,
          capturedAt: contractingHourReadings.capturedAt,
          capturedByUserId: contractingHourReadings.capturedByUserId,
          method: contractingHourReadings.method,
          jobId: contractingMachineAssignments.jobId,
        })
        .from(contractingHourReadings)
        .innerJoin(
          contractingMachineAssignments,
          or(
            eq(contractingMachineAssignments.arrivalReadingId, contractingHourReadings.id),
            eq(contractingMachineAssignments.departureReadingId, contractingHourReadings.id),
          ),
        )
        .where(inArray(contractingHourReadings.id, ids))
    : Promise.resolve([]);
}

function findJobRows(db: Db, ids: string[]) {
  return ids.length ? db.select().from(contractingJobs).where(inArray(contractingJobs.id, ids)) : Promise.resolve([]);
}

function findBreakdowns(db: Db, ids: string[]) {
  return ids.length
    ? selectBreakdowns(db).where(inArray(contractingBreakdowns.id, unique(ids)))
    : Promise.resolve([] as LoadedBreakdown[]);
}

/** The Machine whose arrival started each Job: its earliest accepted arrival. */
function findFirstArrivals(db: Db, jobIds: string[]) {
  return jobIds.length
    ? db
        .selectDistinctOn([contractingMachineAssignments.jobId], {
          jobId: contractingMachineAssignments.jobId,
          machineId: contractingMachineAssignments.machineId,
        })
        .from(contractingMachineAssignments)
        .innerJoin(
          contractingHourReadings,
          eq(contractingHourReadings.id, contractingMachineAssignments.arrivalReadingId),
        )
        .where(inArray(contractingMachineAssignments.jobId, jobIds))
        .orderBy(contractingMachineAssignments.jobId, contractingHourReadings.createdAt, contractingHourReadings.id)
    : Promise.resolve([]);
}

async function findJobRefs(db: Db, ids: string[]): Promise<ActivityJobRef[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: contractingJobs.id,
      code: contractingJobs.code,
      farmName: contractingFarms.name,
      customerName: contractingCustomers.name,
      foremanUserId: contractingJobs.foremanUserId,
    })
    .from(contractingJobs)
    .innerJoin(contractingFarms, eq(contractingFarms.id, contractingJobs.farmId))
    .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
    .where(inArray(contractingJobs.id, unique(ids)));
  return rows.map(({ code, ...row }) => ({ ...row, jobNumber: formatJobNumber(code) }));
}

async function findMachineRefs(db: Db, ids: string[]): Promise<ActivityMachineRef[]> {
  if (!ids.length) return [];
  return db
    .select({
      id: contractingMachines.id,
      code: contractingMachines.code,
      categoryIcon: contractingCategories.icon,
      categoryColour: contractingCategories.colour,
    })
    .from(contractingMachines)
    .innerJoin(contractingCategories, eq(contractingCategories.id, contractingMachines.categoryId))
    .where(inArray(contractingMachines.id, unique(ids)));
}

function findActors(db: Db, ids: string[]) {
  return ids.length
    ? db
        .select({ id: user.id, name: user.name, thumbnailDataUrl: user.image })
        .from(user)
        .where(inArray(user.id, unique(ids)))
    : Promise.resolve([]);
}

/** One page of the Contracting Activity feed, newest first, scoped by the caller's reach. */
export async function listActivity({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: ActivityListInput;
}): Promise<ActivityListResult> {
  if (!canSeeActivity(actor))
    throw new ActivityError('activity.forbidden', 'You do not have permission to view Activity.');
  const keys = await findActivityKeys(db, actor, input);
  const items = await hydrateActivityKeys(db, keys);
  const last = keys.at(-1);
  return {
    items,
    nextCursor:
      keys.length === input.limit && last ? ActivityCursor.parse({ occurredAt: last.cursorAt, id: last.id }) : null,
  };
}
