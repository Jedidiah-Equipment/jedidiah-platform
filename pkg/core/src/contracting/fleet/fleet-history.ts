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
  readingRoleLabels,
  readingSourceLabel,
} from '@pkg/domain/contracting';
import type { UserAccessSummary } from '@pkg/schema';
import {
  type BreakdownSubjectRef,
  type FleetHistoryFilterOptions,
  type FleetHistoryKind,
  type FleetHistoryListInput,
  type FleetHistoryListResult,
  type FleetHistoryReadingRole,
  FleetHistoryRow,
  fleetHistoryKinds,
  type StintReadingRole,
  stintReadingRoles,
} from '@pkg/schema/contracting';
import { and, eq, inArray, isNotNull, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { alias, unionAll } from 'drizzle-orm/pg-core';
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

/** SQL twin of domain `formatHours`, so a search for `1 001.0 h` finds the reading the row shows. */
const hoursSql = (value: SQLWrapper) => sql`replace(to_char(${value}, 'FM999,999,999,990.0'), ',', ' ') || ' h'`;
const labelSql = (column: SQLWrapper, labels: Record<string, string>) =>
  sql`(case ${column} ${sql.join(
    Object.entries(labels).map(([value, label]) => sql`when ${value} then ${label}::text`),
    sql` `,
  )} end)`;
/** What the search box looks in: the row's Kind label and what it says, joined as one line. */
const searchLine = (...parts: SQL[]) =>
  sql`concat_ws(' · ', ${sql.join(
    parts.map((part) => sql`${part}::text`),
    sql`, `,
  )})`;

const serviceMechanic = alias(user, 'history_mechanic');
const readingCapturer = alias(user, 'history_capturer');
const stintJob = alias(contractingJobs, 'history_stint_job');
const stints = contractingMachineAssignments;

/** Each stint's arrival or departure, as the columns of the role it is listed under. */
const stintSide = {
  arrival: { at: stints.arrivalAt, hours: stints.arrivalHours, by: stints.arrivalByUserId },
  departure: { at: stints.departureAt, hours: stints.departureHours, by: stints.departureByUserId },
} as const;
const serviceDate = sql`coalesce(${contractingServiceRecords.endDate}, ${contractingServiceRecords.startDate})`;

/**
 * One Machine's or Implement's History, newest first: every kind the caller may read, paged as one ordered stream.
 * Ledger readings follow Read At with acceptance breaking a tie; a stint's Job Hours sort at the moment they were
 * saved; a service sorts at the start of its plant day.
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

  const stintLeaf = (role: StintReadingRole) => {
    const side = stintSide[role];
    return db
      .select({
        kind: sql<FleetHistoryKind>`'reading'::text`.as('kind'),
        id: sql<string>`${stints.id}`.as('id'),
        at: sql<Date>`${side.at}`.as('at'),
        tie: sql<number>`0::bigint`.as('tie'),
        role: sql<FleetHistoryReadingRole | null>`${role}::text`.as('role'),
      })
      .from(stints)
      .innerJoin(stintJob, eq(stintJob.id, stints.jobId))
      .where(
        only(
          'reading',
          and(
            eq(stints.machineId, subject.id),
            isNotNull(side.at),
            onCalendarDays(side.at, JOHANNESBURG_TIME_ZONE, days),
            createGlobalSearchCondition(search, [
              searchLine(
                sql`${fleetHistoryKindLabels.reading}`,
                hoursSql(side.hours),
                sql`${readingRoleLabels[role]}`,
                jobNumberSql(stintJob.code),
              ),
            ]),
          ),
        ),
      );
  };

  const keys = unionAll(
    db
      .select({
        kind: sql<FleetHistoryKind>`'reading'::text`.as('kind'),
        id: sql<string>`${contractingHourReadings.id}`.as('id'),
        at: sql<Date>`${contractingHourReadings.capturedAt}`.as('at'),
        tie: sql<number>`${contractingHourReadings.sequence}`.as('tie'),
        role: sql<FleetHistoryReadingRole | null>`'spot'::text`.as('role'),
      })
      .from(contractingHourReadings)
      .where(
        only(
          'reading',
          and(
            eq(contractingHourReadings.machineId, subject.id),
            onCalendarDays(contractingHourReadings.capturedAt, JOHANNESBURG_TIME_ZONE, days),
            createGlobalSearchCondition(search, [
              searchLine(
                sql`${fleetHistoryKindLabels.reading}`,
                hoursSql(contractingHourReadings.value),
                sql`${readingRoleLabels.spot}`,
              ),
            ]),
          ),
        ),
      ),
    stintLeaf('arrival'),
    stintLeaf('departure'),
    db
      .select({
        kind: sql<FleetHistoryKind>`'breakdown'::text`.as('kind'),
        id: sql<string>`${contractingBreakdowns.id}`.as('id'),
        at: sql<Date>`${contractingBreakdowns.reportedAt}`.as('at'),
        tie: sql<number>`0::bigint`.as('tie'),
        role: sql<FleetHistoryReadingRole | null>`null::text`.as('role'),
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
                sql`${fleetHistoryKindLabels.breakdown}`,
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
        role: sql<FleetHistoryReadingRole | null>`null::text`.as('role'),
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
                sql`${fleetHistoryKindLabels.service}`,
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
      .select({ kind: keys.kind, id: keys.id, role: keys.role, total: sql<number>`count(*) over ()`.mapWith(Number) })
      .from(keys)
      .orderBy(...order)
      .$dynamic();
  const { rows, total, nextCursor } = await paginateWithWindowTotal(matching, input);
  const loaded = await loadHistoryRows(db, rows);
  const items = rows.flatMap((row) => loaded.get(historyKey(row)) ?? []);
  return { items, nextCursor, total };
}

type HistoryKey = { kind: FleetHistoryKind; id: string; role: FleetHistoryReadingRole | null };

/** A stint is listed twice, once per Job Hours, so its role is part of the key. */
const historyKey = ({ kind, id, role }: HistoryKey) => `${kind}:${role ?? ''}:${id}`;

const idsOf = (rows: readonly HistoryKey[], kind: FleetHistoryKind, role?: FleetHistoryReadingRole) =>
  rows.filter((row) => row.kind === kind && (role === undefined || row.role === role)).map((row) => row.id);

/** What each listed row says, keyed by `historyKey`. */
async function loadHistoryRows(db: Db, rows: readonly HistoryKey[]) {
  const readingIds = idsOf(rows, 'reading', 'spot');
  const stintIds = [...new Set([...idsOf(rows, 'reading', 'arrival'), ...idsOf(rows, 'reading', 'departure')])];
  const breakdownIds = idsOf(rows, 'breakdown');
  const serviceIds = idsOf(rows, 'service');
  const [readings, stintRows, breakdowns, services] = await Promise.all([
    readingIds.length
      ? db
          .select({
            id: contractingHourReadings.id,
            value: contractingHourReadings.value,
            capturedAt: contractingHourReadings.capturedAt,
            telematicsProvider: contractingHourReadings.telematicsProvider,
            capturedByName: readingCapturer.name,
          })
          .from(contractingHourReadings)
          .leftJoin(readingCapturer, eq(readingCapturer.id, contractingHourReadings.capturedByUserId))
          .where(inArray(contractingHourReadings.id, readingIds))
      : [],
    stintIds.length ? loadStintSides(db, stintIds) : [],
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
  for (const reading of readings)
    loaded.set(
      historyKey({ kind: 'reading', id: reading.id, role: 'spot' }),
      FleetHistoryRow.parse({
        id: reading.id,
        kind: 'reading',
        at: reading.capturedAt.toISOString(),
        title: `${readingRoleLabels.spot} · ${formatHours(reading.value)}`,
        detail: null,
        source: readingSourceLabel(reading),
        readingRole: 'spot',
        breakdown: null,
        opens: null,
      }),
    );
  for (const stint of stintRows) {
    const jobNumber = formatJobNumber(stint.jobCode);
    for (const role of stintReadingRoles) {
      const side = stint[role];
      if (side.at === null || side.hours === null) continue;
      loaded.set(
        historyKey({ kind: 'reading', id: stint.id, role }),
        FleetHistoryRow.parse({
          id: stint.id,
          kind: 'reading',
          at: side.at.toISOString(),
          title: `${readingRoleLabels[role]} · ${formatHours(side.hours)}`,
          detail: jobNumber,
          source: side.byName && getFirstName(side.byName),
          readingRole: role,
          breakdown: null,
          opens: { to: 'job', jobNumber },
        }),
      );
    }
  }
  for (const breakdown of breakdowns) {
    const reporter = getFirstName(breakdown.reporterName);
    loaded.set(
      historyKey({ kind: 'breakdown', id: breakdown.id, role: null }),
      FleetHistoryRow.parse({
        id: breakdown.id,
        kind: 'breakdown',
        at: breakdown.reportedAt.toISOString(),
        title: breakdownFirstLine(breakdown.description),
        detail:
          breakdown.jobCode === null
            ? `Reported by ${reporter}`
            : `${formatJobNumber(breakdown.jobCode)} · reported by ${reporter}`,
        source: null,
        readingRole: null,
        breakdown: { urgency: breakdown.urgency, status: breakdown.status },
        opens: { to: 'breakdown', id: breakdown.id },
      }),
    );
  }
  for (const service of services) {
    loaded.set(
      historyKey({ kind: 'service', id: service.id, role: null }),
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
        source: null,
        readingRole: null,
        breakdown: null,
        opens: { to: 'service' },
      }),
    );
  }
  return loaded;
}

const arrivalCapturer = alias(user, 'history_arrival_capturer');
const departureCapturer = alias(user, 'history_departure_capturer');

/** The listed stints' Job Hours, each side with its moment and who saved it, and the Job it was on. */
async function loadStintSides(db: Db, ids: string[]) {
  const rows = await db
    .select({
      id: stints.id,
      jobCode: stintJob.code,
      arrivalHours: stints.arrivalHours,
      arrivalAt: stints.arrivalAt,
      arrivalByName: arrivalCapturer.name,
      departureHours: stints.departureHours,
      departureAt: stints.departureAt,
      departureByName: departureCapturer.name,
    })
    .from(stints)
    .innerJoin(stintJob, eq(stintJob.id, stints.jobId))
    .leftJoin(arrivalCapturer, eq(arrivalCapturer.id, stints.arrivalByUserId))
    .leftJoin(departureCapturer, eq(departureCapturer.id, stints.departureByUserId))
    .where(inArray(stints.id, ids));
  return rows.map((row) => ({
    id: row.id,
    jobCode: row.jobCode,
    arrival: { hours: row.arrivalHours, at: row.arrivalAt, byName: row.arrivalByName },
    departure: { hours: row.departureHours, at: row.departureAt, byName: row.departureByName },
  }));
}
