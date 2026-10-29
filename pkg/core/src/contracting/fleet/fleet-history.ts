import {
  createGlobalSearchCondition,
  type Db,
  getSortOrder,
  onCalendarDays,
  paginateWithWindowTotal,
  user,
} from '@pkg/db';
import {
  contractingBreakdowns,
  contractingHourReadings,
  contractingJobs,
  contractingMachineAssignments,
  contractingServiceRecords,
} from '@pkg/db/contracting';
import { formatHours, getFirstName, hasPermission, JOHANNESBURG_TIME_ZONE } from '@pkg/domain';
import {
  breakdownFirstLine,
  breakdownStatusLabels,
  breakdownUrgencyLabels,
  fleetHistoryKindLabels,
  formatJobNumber,
  readingEvidenceLabel,
  readingRoleLabels,
} from '@pkg/domain/contracting';
import type { UserAccessSummary } from '@pkg/schema';
import {
  type BreakdownSubjectRef,
  type FleetHistoryFilterOptions,
  type FleetHistoryKind,
  type FleetHistoryListInput,
  type FleetHistoryListResult,
  FleetHistoryRow,
  fleetHistoryKinds,
} from '@pkg/schema/contracting';
import { and, eq, inArray, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { alias, type PgSelect, unionAll } from 'drizzle-orm/pg-core';
import { breakdownReporter } from '../breakdowns/breakdown-load.js';
import { jobNumberSql } from '../jobs/job-sql.js';

const kindPermissions = {
  reading: 'contracting_machine:read',
  breakdown: 'contracting_breakdown:read',
  service: 'contracting_service:read',
} as const;
/** History lists only the kinds the caller may read, so any one of their permissions opens it. */
export const fleetHistoryReadPermissions = Object.values(kindPermissions);

/** An Implement has no readings or services, so its History is its Breakdowns. */
function readableKinds(actor: UserAccessSummary, subject: BreakdownSubjectRef): FleetHistoryKind[] {
  return fleetHistoryKinds.filter(
    (kind) => (subject.kind === 'machine' || kind === 'breakdown') && hasPermission(actor, kindPermissions[kind]),
  );
}

export function listFleetHistoryFilterOptions({
  actor,
  subject,
}: {
  actor: UserAccessSummary;
  subject: BreakdownSubjectRef;
}): FleetHistoryFilterOptions {
  return { kinds: readableKinds(actor, subject) };
}

const arrivalStint = alias(contractingMachineAssignments, 'history_arrival');
const arrivalJob = alias(contractingJobs, 'history_arrival_job');
const departureStint = alias(contractingMachineAssignments, 'history_departure');
const departureJob = alias(contractingJobs, 'history_departure_job');
/** Each reading opens or closes at most one stint, so these joins never repeat a reading. */
function joinStints<Query extends PgSelect>(query: Query) {
  return query
    .leftJoin(arrivalStint, eq(arrivalStint.arrivalReadingId, contractingHourReadings.id))
    .leftJoin(arrivalJob, eq(arrivalJob.id, arrivalStint.jobId))
    .leftJoin(departureStint, eq(departureStint.departureReadingId, contractingHourReadings.id))
    .leftJoin(departureJob, eq(departureJob.id, departureStint.jobId));
}
/** A reading that closed one stint and opened the next is listed under the Job it opened. */
const readingJobCode = sql<number | null>`coalesce(${arrivalJob.code}, ${departureJob.code})`;

/** SQL twin of domain `formatHours`, so a search for `1 001.0 h` finds the reading the row shows. */
const hoursSql = (value: SQLWrapper) => sql`replace(to_char(${value}, 'FM999,999,999,990.0'), ',', ' ') || ' h'`;
const labelSql = (column: SQLWrapper, labels: Record<string, string>) =>
  sql`(case ${column} ${sql.join(
    Object.entries(labels).map(([value, label]) => sql`when ${value} then ${label}::text`),
    sql` `,
  )} end)`;
/** What the search box looks in: the row's kind and what it says, joined as one line. */
const searchLine = (...parts: SQL[]) =>
  sql`concat_ws(' · ', ${sql.join(
    parts.map((part) => sql`${part}::text`),
    sql`, `,
  )})`;

const serviceMechanic = alias(user, 'history_mechanic');
const serviceDate = sql`coalesce(${contractingServiceRecords.endDate}, ${contractingServiceRecords.startDate})`;

/**
 * One Machine's or Implement's History, newest first: every kind the caller may read, paged as one ordered stream.
 * Readings follow Read At with acceptance breaking a tie (ADR 0025); a service sorts at the start of its plant day.
 */
export async function listFleetHistory({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: UserAccessSummary;
  input: FleetHistoryListInput;
}): Promise<FleetHistoryListResult> {
  const readable = readableKinds(actor, input.subject);
  const listed = input.kinds.length ? readable.filter((kind) => input.kinds.includes(kind)) : readable;
  /** A kind the caller does not list still takes its place in the union, as a leaf with no rows. */
  const only = (kind: FleetHistoryKind, where: SQL | undefined) => (listed.includes(kind) ? where : sql`false`);
  const { subject, search } = input;
  const days = { from: input.from, to: input.to };

  const keys = unionAll(
    joinStints(
      db
        .select({
          kind: sql<FleetHistoryKind>`'reading'::text`.as('kind'),
          id: sql<string>`${contractingHourReadings.id}`.as('id'),
          at: sql<Date>`${contractingHourReadings.capturedAt}`.as('at'),
          tie: sql<number>`${contractingHourReadings.sequence}`.as('tie'),
        })
        .from(contractingHourReadings)
        .$dynamic(),
    ).where(
      only(
        'reading',
        and(
          eq(contractingHourReadings.machineId, subject.id),
          onCalendarDays(contractingHourReadings.capturedAt, JOHANNESBURG_TIME_ZONE, days),
          createGlobalSearchCondition(search, [
            searchLine(
              sql`'Reading'`,
              hoursSql(contractingHourReadings.value),
              labelSql(contractingHourReadings.role, readingRoleLabels),
              jobNumberSql(readingJobCode),
            ),
          ]),
        ),
      ),
    ),
    db
      .select({
        kind: sql<FleetHistoryKind>`'breakdown'::text`.as('kind'),
        id: sql<string>`${contractingBreakdowns.id}`.as('id'),
        at: sql<Date>`${contractingBreakdowns.reportedAt}`.as('at'),
        tie: sql<number>`0::bigint`.as('tie'),
      })
      .from(contractingBreakdowns)
      .where(
        only(
          'breakdown',
          and(
            eq(
              subject.kind === 'machine' ? contractingBreakdowns.machineId : contractingBreakdowns.implementId,
              subject.id,
            ),
            onCalendarDays(contractingBreakdowns.reportedAt, JOHANNESBURG_TIME_ZONE, days),
            createGlobalSearchCondition(search, [
              searchLine(
                sql`'Breakdown'`,
                labelSql(contractingBreakdowns.urgency, breakdownUrgencyLabels),
                sql`${contractingBreakdowns.description}`,
                labelSql(contractingBreakdowns.status, breakdownStatusLabels),
              ),
            ]),
          ),
        ),
      ),
    db
      .select({
        kind: sql<FleetHistoryKind>`'service'::text`.as('kind'),
        id: sql<string>`${contractingServiceRecords.id}`.as('id'),
        at: sql<Date>`(${serviceDate}::timestamp at time zone ${JOHANNESBURG_TIME_ZONE})`.as('at'),
        tie: sql<number>`0::bigint`.as('tie'),
      })
      .from(contractingServiceRecords)
      .leftJoin(serviceMechanic, eq(serviceMechanic.id, contractingServiceRecords.primaryMechanicUserId))
      .where(
        only(
          'service',
          and(
            eq(contractingServiceRecords.machineId, subject.id),
            input.from ? sql`${serviceDate} >= ${input.from}::date` : undefined,
            input.to ? sql`${serviceDate} <= ${input.to}::date` : undefined,
            createGlobalSearchCondition(search, [
              searchLine(
                sql`'Service'`,
                sql`coalesce(${hoursSql(contractingServiceRecords.readingAtServiceHours)}, 'in the workshop')`,
                sql`${serviceMechanic.name}`,
              ),
            ]),
          ),
        ),
      ),
  ).as('fleet_history_keys');

  // Kind sorts by the label the column shows; within a kind, newest first.
  const byKind = input.sortBy === 'kind';
  const timeDirection = byKind ? 'desc' : input.sortDirection;
  const order = [
    ...(byKind ? [getSortOrder(labelSql(keys.kind, fleetHistoryKindLabels), input.sortDirection)] : []),
    getSortOrder(keys.at, timeDirection),
    getSortOrder(keys.tie, timeDirection),
    getSortOrder(keys.id, timeDirection),
  ];
  const matching = () =>
    db
      .select({ kind: keys.kind, id: keys.id, total: sql<number>`count(*) over ()`.mapWith(Number) })
      .from(keys)
      .orderBy(...order)
      .$dynamic();
  const { rows, total, nextCursor } = await paginateWithWindowTotal(matching, input);
  const loaded = await loadHistoryRows(db, rows);
  const items = rows.flatMap(({ kind, id }) => loaded.get(`${kind}:${id}`) ?? []);
  return { items, nextCursor, total };
}

const idsOf = (rows: readonly { kind: FleetHistoryKind; id: string }[], kind: FleetHistoryKind) =>
  rows.filter((row) => row.kind === kind).map((row) => row.id);

/** What each listed row says, keyed by `kind:id`. */
async function loadHistoryRows(db: Db, rows: readonly { kind: FleetHistoryKind; id: string }[]) {
  const readingIds = idsOf(rows, 'reading');
  const breakdownIds = idsOf(rows, 'breakdown');
  const serviceIds = idsOf(rows, 'service');
  const [readings, breakdowns, services] = await Promise.all([
    readingIds.length
      ? joinStints(
          db
            .select({
              id: contractingHourReadings.id,
              role: contractingHourReadings.role,
              value: contractingHourReadings.value,
              capturedAt: contractingHourReadings.capturedAt,
              telematicsProvider: contractingHourReadings.telematicsProvider,
              photoBacked: sql<boolean>`${contractingHourReadings.photo} is not null`,
              aiValue: contractingHourReadings.aiValue,
              aiVerification: contractingHourReadings.aiVerification,
              jobCode: readingJobCode,
            })
            .from(contractingHourReadings)
            .$dynamic(),
        ).where(inArray(contractingHourReadings.id, readingIds))
      : [],
    breakdownIds.length
      ? db
          .select({
            id: contractingBreakdowns.id,
            reportedAt: contractingBreakdowns.reportedAt,
            urgency: contractingBreakdowns.urgency,
            status: contractingBreakdowns.status,
            description: contractingBreakdowns.description,
            jobCode: contractingJobs.code,
            reporterName: breakdownReporter.name,
          })
          .from(contractingBreakdowns)
          .innerJoin(breakdownReporter, eq(breakdownReporter.id, contractingBreakdowns.reportedByUserId))
          .leftJoin(contractingJobs, eq(contractingJobs.id, contractingBreakdowns.jobId))
          .where(inArray(contractingBreakdowns.id, breakdownIds))
      : [],
    serviceIds.length
      ? db
          .select({
            id: contractingServiceRecords.id,
            startDate: contractingServiceRecords.startDate,
            endDate: contractingServiceRecords.endDate,
            readingAtServiceHours: contractingServiceRecords.readingAtServiceHours,
            nextServiceDueHoursSet: contractingServiceRecords.nextServiceDueHoursSet,
            mechanicName: serviceMechanic.name,
          })
          .from(contractingServiceRecords)
          .leftJoin(serviceMechanic, eq(serviceMechanic.id, contractingServiceRecords.primaryMechanicUserId))
          .where(inArray(contractingServiceRecords.id, serviceIds))
      : [],
  ]);
  const loaded = new Map<string, FleetHistoryRow>();
  for (const reading of readings) {
    const jobNumber = reading.jobCode === null ? null : formatJobNumber(reading.jobCode);
    loaded.set(
      `reading:${reading.id}`,
      FleetHistoryRow.parse({
        id: reading.id,
        kind: 'reading',
        at: reading.capturedAt.toISOString(),
        title: `${readingRoleLabels[reading.role]} · ${formatHours(reading.value)}`,
        detail: jobNumber,
        evidence: readingEvidenceLabel(reading),
        readingRole: reading.role,
        breakdown: null,
        opens: jobNumber ? { to: 'job', jobNumber } : null,
      }),
    );
  }
  for (const breakdown of breakdowns) {
    const reporter = getFirstName(breakdown.reporterName);
    loaded.set(
      `breakdown:${breakdown.id}`,
      FleetHistoryRow.parse({
        id: breakdown.id,
        kind: 'breakdown',
        at: breakdown.reportedAt.toISOString(),
        title: breakdownFirstLine(breakdown.description),
        detail:
          breakdown.jobCode === null
            ? `Reported by ${reporter}`
            : `${formatJobNumber(breakdown.jobCode)} · reported by ${reporter}`,
        evidence: null,
        readingRole: null,
        breakdown: { urgency: breakdown.urgency, status: breakdown.status },
        opens: { to: 'breakdown', id: breakdown.id },
      }),
    );
  }
  for (const service of services) {
    loaded.set(
      `service:${service.id}`,
      FleetHistoryRow.parse({
        id: service.id,
        kind: 'service',
        at: service.endDate ?? service.startDate,
        title: [
          'Service',
          service.readingAtServiceHours === null ? 'in the workshop' : formatHours(service.readingAtServiceHours),
          service.mechanicName ? getFirstName(service.mechanicName) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        detail:
          service.nextServiceDueHoursSet === null
            ? null
            : `Next service due set to ${formatHours(service.nextServiceDueHoursSet)}`,
        evidence: null,
        readingRole: null,
        breakdown: null,
        opens: { to: 'service' },
      }),
    );
  }
  return loaded;
}
