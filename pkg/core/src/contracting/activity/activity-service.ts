import { createGlobalSearchCondition, type Db, user } from '@pkg/db';
import {
  contractingBreakdowns,
  contractingCategories,
  contractingCustomers,
  contractingFarms,
  contractingImplements,
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
  type JobActor,
  jobReadMode,
} from '@pkg/domain/contracting';
import type { DateIso } from '@pkg/schema';
import {
  ActivityCursor,
  ActivityItem,
  type ActivityItemType,
  type ActivityJobRef,
  ActivityListInput,
  type ActivityListResult,
  type ActivityMachineRef,
} from '@pkg/schema/contracting';
import { and, eq, inArray, isNotNull, ne, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { alias, type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import { getActivityView, setActivityView } from '../../users/activity-view-service.js';
import {
  breakdownReadableBy,
  breakdownSubjectOf,
  type LoadedBreakdown,
  selectBreakdowns,
} from '../breakdowns/breakdown-load.js';
import { readableBy, readerFor } from '../jobs/job-readers.js';
import { jobNumberSql } from '../jobs/job-sql.js';
import { type NoteThreadTable, noteThreadStore } from '../notes/note-thread.js';
import { ActivityError } from './activity-errors.js';

/**
 * The Contracting Activity feed: one keyset-paged stream read off the records themselves (ADR 0023). Each item type
 * is one branch of a `union all` over its own `(stamp, id)` index, so a page is a merge of indexed walks that stops at
 * the limit; nothing counts the union and nothing offsets into it.
 */

/** One page row: which row, which type, the exact stamp, and the records the item names, read with the key. */
type ActivityKey = {
  id: string;
  type: ActivityItemType;
  occurredAt: Date;
  cursorAt: string;
  jobId: string | null;
  breakdownId: string | null;
  machineId: string | null;
  actorId: string | null;
};

type Branch = {
  type: ActivityItemType;
  /** The row the item is, its stamp, and everything the branch filters on, as one select. */
  select: (where: (row: BranchRow) => SQL | undefined) => { getSQL(): SQL };
};
type BranchRow = { id: PgColumn; stamp: PgColumn };
/** What a branch's row names, as columns or scalar subselects; a record the type never has is left out. */
type KeyRefs = {
  jobId?: SQLWrapper | undefined;
  breakdownId?: SQLWrapper | undefined;
  machineId?: SQLWrapper | undefined;
  actorId?: SQLWrapper | undefined;
};

/**
 * A record kind items are stamped off and reached through: its table, what this caller reaches, the thread asked
 * about, how a search names it, and the records its items name.
 */
type Host = {
  table: PgTable;
  id: PgColumn;
  reach: SQL | undefined;
  scope: SQL | undefined;
  matches: (id: SQLWrapper, search: string) => SQL;
  refs: Pick<KeyRefs, 'jobId' | 'breakdownId'>;
};

const searchJob = alias(contractingJobs, 'activity_search_job');
const searchFarm = alias(contractingFarms, 'activity_search_farm');
const searchCustomer = alias(contractingCustomers, 'activity_search_customer');
const searchBreakdown = alias(contractingBreakdowns, 'activity_search_breakdown');
const searchMachine = alias(contractingMachines, 'activity_search_machine');
const searchImplement = alias(contractingImplements, 'activity_search_implement');
const searchMechanic = alias(user, 'activity_search_mechanic');
const searchUser = alias(user, 'activity_search_user');

/** Every matcher is built behind a non-empty search, the only input the shared condition has no answer for. */
function searching(search: string, expressions: readonly SQL[]): SQL {
  const condition = createGlobalSearchCondition(search, expressions);
  if (!condition) throw new Error('Activity search matchers take a non-empty search');
  return condition;
}

/** A person named on the item by id, matched by name. */
const userMatches = (userId: SQLWrapper, search: string): SQL => sql`exists (
  select 1 from ${user} ${searchUser}
  where ${searchUser.id} = ${userId}
    and ${searching(search, [sql`${searchUser.name}`])}
)`;

/** A Job matched by its Job Number, Farm or Customer. */
const jobMatches = (jobId: SQLWrapper, search: string): SQL => sql`exists (
  select 1 from ${contractingJobs} ${searchJob}
  inner join ${contractingFarms} ${searchFarm} on ${searchFarm.id} = ${searchJob.farmId}
  inner join ${contractingCustomers} ${searchCustomer} on ${searchCustomer.id} = ${searchJob.customerId}
  where ${searchJob.id} = ${jobId}
    and ${searching(search, [jobNumberSql(searchJob.code), sql`${searchFarm.name}`, sql`${searchCustomer.name}`])}
)`;

/** A Machine matched by its code. */
const machineMatches = (machineId: SQLWrapper, search: string): SQL => sql`exists (
  select 1 from ${contractingMachines} ${searchMachine}
  where ${searchMachine.id} = ${machineId}
    and ${searching(search, [sql`${searchMachine.code}`])}
)`;

/** A Breakdown matched by its subject's code, its Mechanic, or its Job. */
const breakdownMatches = (breakdownId: SQLWrapper, search: string): SQL => sql`exists (
  select 1 from ${contractingBreakdowns} ${searchBreakdown}
  left join ${contractingMachines} ${searchMachine} on ${searchMachine.id} = ${searchBreakdown.machineId}
  left join ${contractingImplements} ${searchImplement} on ${searchImplement.id} = ${searchBreakdown.implementId}
  left join ${user} ${searchMechanic} on ${searchMechanic.id} = ${searchBreakdown.primaryMechanicUserId}
  where ${searchBreakdown.id} = ${breakdownId}
    and (${searching(search, [sql`${searchMachine.code}`, sql`${searchImplement.code}`, sql`${searchMechanic.name}`])}
      or ${jobMatches(searchBreakdown.jobId, search)})
)`;

/** The Machine whose arrival started a Job: the one a `job-started` item names. */
const firstArrivalMachine = (jobId: SQLWrapper) => sql`(
  select first_stint.machine_id
  from contracting.machine_assignment first_stint
  where first_stint.job_id = ${jobId}
    and first_stint.arrival_at is not null
  order by first_stint.arrival_at, first_stint.id
  limit 1
)`;

const textMatches = (column: SQLWrapper, search: string): SQL => searching(search, [sql`${column}`]);

/** A row reaches through its host record: the record is readable, and (scoped) is the one asked about. */
const through = (host: Host, fk: SQLWrapper) => sql`exists (
  select 1 from ${host.table}
  where ${host.id} = ${fk}
    and ${and(host.reach, host.scope) ?? sql`true`}
)`;

/** Each branch projects the same columns, so the union's nulls are typed where a type names no such record. */
function keySelect(db: Db, type: ActivityItemType, row: BranchRow, refs: KeyRefs) {
  const uuid = (ref: SQLWrapper | undefined) =>
    ref ? sql<string | null>`${ref}::uuid` : sql<string | null>`null::uuid`;
  return db.select({
    id: sql<string>`${row.id}`.as('id'),
    occurredAt: sql<Date>`${row.stamp}`.as('occurred_at'),
    type: sql<ActivityItemType>`${sql.raw(`'${type}'`)}::text`.as('type'),
    jobId: uuid(refs.jobId).as('job_id'),
    breakdownId: uuid(refs.breakdownId).as('breakdown_id'),
    machineId: uuid(refs.machineId).as('machine_id'),
    actorId: (refs.actorId ? sql<string | null>`${refs.actorId}::text` : sql<string | null>`null::text`).as('actor_id'),
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
  const job: Host = {
    table: contractingJobs,
    id: contractingJobs.id,
    reach: jobReach ?? undefined,
    scope: input.jobId ? eq(contractingJobs.id, input.jobId) : undefined,
    matches: jobMatches,
    refs: { jobId: contractingJobs.id },
  };
  const breakdown: Host = {
    table: contractingBreakdowns,
    id: contractingBreakdowns.id,
    reach: breakdownReach?.where,
    scope: and(
      input.jobId ? eq(contractingBreakdowns.jobId, input.jobId) : undefined,
      input.breakdownId ? eq(contractingBreakdowns.id, input.breakdownId) : undefined,
    ),
    matches: breakdownMatches,
    refs: { jobId: contractingBreakdowns.jobId, breakdownId: contractingBreakdowns.id },
  };

  /** A stamp on the host itself: the item is the host row at the instant `stamp` holds, done by `by`. */
  const stampBranch = (
    host: Host,
    type: ActivityItemType,
    stamp: PgColumn,
    by: PgColumn,
    {
      extra,
      matches,
      machineId,
    }: { extra?: SQL | undefined; matches?: (search: string) => SQL; machineId?: SQLWrapper } = {},
  ): Branch => ({
    type,
    select: (where) => {
      const row = { id: host.id, stamp };
      return keySelect(db, type, row, { ...host.refs, machineId, actorId: by })
        .from(host.table)
        .where(
          and(
            isNotNull(stamp),
            extra,
            host.reach,
            host.scope,
            search ? or(host.matches(host.id, search), userMatches(by, search), matches?.(search)) : undefined,
            where(row),
          ),
        );
    },
  });

  /** A Note Thread entry, joined to its host for the host's reach, scope and the records the entry names. */
  const noteBranch = (host: Host, type: 'job-note' | 'breakdown-note', notes: NoteThreadTable): Branch => ({
    type,
    select: (where) => {
      const row = { id: notes.table.id, stamp: notes.table.createdAt };
      return keySelect(db, type, row, { ...host.refs, actorId: notes.table.authorUserId })
        .from(notes.table)
        .innerJoin(host.table, eq(host.id, notes.threadColumn))
        .where(
          and(
            host.reach,
            host.scope,
            search
              ? or(
                  textMatches(notes.table.text, search),
                  userMatches(notes.table.authorUserId, search),
                  host.matches(notes.threadColumn, search),
                )
              : undefined,
            where(row),
          ),
        );
    },
  });

  /** A stint's Job Hours captured: the item is the stint at the instant the server saved them. */
  const stintBranch = (type: 'machine-arrived' | 'machine-left', stamp: PgColumn, by: PgColumn): Branch => ({
    type,
    select: (where) => {
      const stints = contractingMachineAssignments;
      const row = { id: stints.id, stamp };
      return keySelect(db, type, row, { jobId: stints.jobId, machineId: stints.machineId, actorId: by })
        .from(stints)
        .where(
          and(
            isNotNull(stamp),
            through(job, stints.jobId),
            search
              ? or(jobMatches(stints.jobId, search), machineMatches(stints.machineId, search), userMatches(by, search))
              : undefined,
            where(row),
          ),
        );
    },
  });

  const breakdowns = contractingBreakdowns;
  const jobs = contractingJobs;
  const all: (Branch | false)[] = [
    jobSide && noteBranch(job, 'job-note', noteThreadStore.job.notes),
    breakdownReach !== null && noteBranch(breakdown, 'breakdown-note', noteThreadStore.breakdown.notes),
    breakdownReach !== null &&
      stampBranch(breakdown, 'breakdown-reported', breakdowns.reportedAt, breakdowns.reportedByUserId, {
        matches: (term) => textMatches(breakdowns.description, term),
      }),
    breakdownReach !== null &&
      stampBranch(breakdown, 'mechanic-assigned', breakdowns.mechanicAssignedAt, breakdowns.mechanicAssignedByUserId),
    // Solving straight from Not fixed stamps the start and the fix at one instant: that reads as one Fixed item.
    breakdownReach !== null &&
      stampBranch(breakdown, 'breakdown-started', breakdowns.startedAt, breakdowns.startedByUserId, {
        extra: or(sql`${breakdowns.solvedAt} is null`, ne(breakdowns.startedAt, breakdowns.solvedAt)),
      }),
    breakdownReach !== null &&
      stampBranch(breakdown, 'breakdown-solved', breakdowns.solvedAt, breakdowns.solvedByUserId, {
        matches: (term) => textMatches(breakdowns.closeOutNote, term),
      }),
    jobSide &&
      stampBranch(job, 'job-started', jobs.activatedAt, jobs.activatedByUserId, {
        machineId: firstArrivalMachine(jobs.id),
        matches: (term) => machineMatches(firstArrivalMachine(jobs.id), term),
      }),
    jobSide && stampBranch(job, 'job-completed', jobs.completedAt, jobs.completedByUserId),
    jobSide &&
      stampBranch(job, 'job-cancelled', jobs.cancelledAt, jobs.cancelledByUserId, {
        matches: (term) => textMatches(jobs.cancellationReason, term),
      }),
    jobSide &&
      stintBranch(
        'machine-arrived',
        contractingMachineAssignments.arrivalAt,
        contractingMachineAssignments.arrivalByUserId,
      ),
    jobSide &&
      stintBranch(
        'machine-left',
        contractingMachineAssignments.departureAt,
        contractingMachineAssignments.departureByUserId,
      ),
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
      to_char(activity_keys.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at,
      activity_keys.job_id, activity_keys.breakdown_id, activity_keys.machine_id, activity_keys.actor_id
    from (${union}) as activity_keys
    order by activity_keys.occurred_at desc, activity_keys.id desc
    limit ${input.limit}
  `;
}

type ActivityKeyRow = {
  id: string;
  type: ActivityItemType;
  cursor_at: string;
  job_id: string | null;
  breakdown_id: string | null;
  machine_id: string | null;
  actor_id: string | null;
};

/** One page of the stream as keys: which row, which type, and the exact stamp the next page continues below. */
async function findActivityKeys(db: Db, actor: JobActor, input: ActivityListInput): Promise<ActivityKey[]> {
  const query = activityPageQuery(db, actor, input);
  if (!query) return [];
  const rows = await db.execute<ActivityKeyRow>(query);
  return [...rows].map((row) => ({
    id: row.id,
    type: row.type,
    occurredAt: new Date(row.cursor_at),
    cursorAt: row.cursor_at,
    jobId: row.job_id,
    breakdownId: row.breakdown_id,
    machineId: row.machine_id,
    actorId: row.actor_id,
  }));
}

/** The page's items: one lookup per record kind the keys name, then each key read in the order the keys fixed. */
async function hydrateActivityKeys(db: Db, keys: ActivityKey[]): Promise<ActivityItem[]> {
  const idsOf = (...types: ActivityItemType[]) => keys.filter((key) => types.includes(key.type)).map((key) => key.id);
  const named = (ref: 'jobId' | 'breakdownId' | 'machineId' | 'actorId') => keys.flatMap((key) => key[ref] ?? []);
  const [jobRefs, machineRefs, actors, breakdowns, jobNotes, breakdownNotes, stints, jobRows] = await Promise.all([
    findJobRefs(db, named('jobId')),
    findMachineRefs(db, named('machineId')),
    findActors(db, named('actorId')),
    findBreakdowns(db, named('breakdownId')),
    findNotes(db, noteThreadStore.job.notes, idsOf('job-note')),
    findNotes(db, noteThreadStore.breakdown.notes, idsOf('breakdown-note')),
    findStints(db, idsOf('machine-arrived', 'machine-left')),
    findJobRows(db, idsOf('job-started', 'job-completed', 'job-cancelled')),
  ]);

  const byId = <T extends { id: string }>(rows: readonly T[]) => new Map(rows.map((row) => [row.id, row]));
  const jobNoteById = byId(jobNotes);
  const breakdownNoteById = byId(breakdownNotes);
  const stintById = byId(stints);
  const jobRowById = byId(jobRows);
  const breakdownById = new Map(breakdowns.map((row) => [row.breakdown.id, row]));
  const jobRefById = byId(jobRefs);
  const machineRefById = byId(machineRefs);
  const actorById = byId(actors);

  const found = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new Error(`Activity ${what} vanished between paging and hydration`);
    return value;
  };
  const actor = (key: ActivityKey) => found(key.actorId === null ? undefined : actorById.get(key.actorId), 'actor');
  const job = (id: string | null) => found(id === null ? undefined : jobRefById.get(id), `Job ${id}`);
  const machine = (key: ActivityKey) =>
    found(key.machineId === null ? undefined : machineRefById.get(key.machineId), 'Machine');
  /** The loaded Breakdown and the refs every Breakdown item carries. */
  const breakdown = (key: ActivityKey) => {
    const row = found(key.breakdownId === null ? undefined : breakdownById.get(key.breakdownId), 'Breakdown');
    const refs = {
      breakdown: {
        id: row.breakdown.id,
        urgency: row.breakdown.urgency,
        status: row.breakdown.status,
        subject: breakdownSubjectOf(row),
        jobId: row.breakdown.jobId,
      },
      job: key.jobId === null ? null : job(key.jobId),
    };
    return { row, refs };
  };
  const jobHours = (key: ActivityKey) => {
    const row = found(stintById.get(key.id), `Machine Assignment ${key.id}`);
    const hours = key.type === 'machine-arrived' ? row.arrivalHours : row.departureHours;
    return { job: job(key.jobId), machine: machine(key), hours: found(hours ?? undefined, 'Job Hours') };
  };

  const toItem = (key: ActivityKey): ActivityItem => {
    const base = { type: key.type, id: key.id, occurredAt: key.occurredAt.toISOString(), actor: actor(key) };
    switch (key.type) {
      case 'job-note':
        return ActivityItem.parse({
          ...base,
          job: job(key.jobId),
          text: found(jobNoteById.get(key.id), `Job Note ${key.id}`).text,
        });
      case 'breakdown-note':
        return ActivityItem.parse({
          ...base,
          ...breakdown(key).refs,
          text: found(breakdownNoteById.get(key.id), `Breakdown Note ${key.id}`).text,
        });
      case 'breakdown-reported': {
        const { row, refs } = breakdown(key);
        return ActivityItem.parse({ ...base, ...refs, firstLine: breakdownFirstLine(row.breakdown.description) });
      }
      case 'mechanic-assigned': {
        const { row, refs } = breakdown(key);
        return ActivityItem.parse({ ...base, ...refs, mechanicName: row.mechanicName });
      }
      case 'breakdown-started':
        return ActivityItem.parse({ ...base, ...breakdown(key).refs });
      case 'breakdown-solved': {
        const { row, refs } = breakdown(key);
        return ActivityItem.parse({ ...base, ...refs, closeOutNote: row.breakdown.closeOutNote });
      }
      case 'job-started':
        return ActivityItem.parse({ ...base, job: job(key.jobId), machine: machine(key) });
      case 'job-completed':
        return ActivityItem.parse({ ...base, job: job(key.jobId) });
      case 'job-cancelled':
        return ActivityItem.parse({
          ...base,
          job: job(key.jobId),
          reason: found(jobRowById.get(key.id), `Job ${key.id}`).cancellationReason ?? '',
        });
      case 'machine-arrived':
      case 'machine-left':
        return ActivityItem.parse({ ...base, ...jobHours(key) });
    }
  };
  return keys.map(toItem);
}

const unique = (ids: readonly string[]) => [...new Set(ids)];

function findNotes(db: Db, { table }: NoteThreadTable, ids: string[]) {
  return ids.length
    ? db.select({ id: table.id, text: table.text }).from(table).where(inArray(table.id, ids))
    : Promise.resolve([]);
}

function findStints(db: Db, ids: string[]) {
  return ids.length
    ? db
        .select({
          id: contractingMachineAssignments.id,
          arrivalHours: contractingMachineAssignments.arrivalHours,
          departureHours: contractingMachineAssignments.departureHours,
        })
        .from(contractingMachineAssignments)
        .where(inArray(contractingMachineAssignments.id, unique(ids)))
    : Promise.resolve([]);
}

function findJobRows(db: Db, ids: string[]) {
  return ids.length
    ? db
        .select({ id: contractingJobs.id, cancellationReason: contractingJobs.cancellationReason })
        .from(contractingJobs)
        .where(inArray(contractingJobs.id, ids))
    : Promise.resolve([]);
}

function findBreakdowns(db: Db, ids: string[]) {
  return ids.length
    ? selectBreakdowns(db).where(inArray(contractingBreakdowns.id, unique(ids)))
    : Promise.resolve([] as LoadedBreakdown[]);
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

/** The caller's Contracting Activity View. */
export function getContractingActivityView({ db, actor }: { db: Db; actor: JobActor }): Promise<DateIso> {
  return getActivityView({ db, userId: actor.userId, business: 'contracting' });
}

/** Acknowledges the feed through `seenAt`, clamped to the newest item this caller can see. */
export function markContractingActivitySeen({
  db,
  actor,
  seenAt,
}: {
  db: Db;
  actor: JobActor;
  seenAt: DateIso;
}): Promise<DateIso> {
  return setActivityView({
    db,
    userId: actor.userId,
    business: 'contracting',
    seenAt,
    latestActivityAt: async () =>
      (await listActivity({ db, actor, input: ActivityListInput.parse({ limit: 1 }) })).items[0]?.occurredAt ?? null,
  });
}
