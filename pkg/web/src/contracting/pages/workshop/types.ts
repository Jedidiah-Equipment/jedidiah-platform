import { actionSheet } from '@pkg/domain/contracting';
import { DateOnlyIso } from '@pkg/schema';
import type {
  BreakdownDetail,
  BreakdownListInput,
  BreakdownPatchInput,
  BreakdownStatus,
  BreakdownStatusCounts,
  BreakdownSubjectRef,
  BreakdownUrgency,
} from '@pkg/schema/contracting';
import { breakdownStatuses, breakdownUrgencies, unsolvedBreakdownStatuses } from '@pkg/schema/contracting';
import type { ColumnFiltersState } from '@tanstack/react-table';
import {
  isPickedExactly,
  readDateRangeFilter,
  readMultiSelectFilter,
  togglePick,
} from '@/components/data-table/column-filter-values.js';

/** The Breakdown page's reading of the Breakdown Actions the server served, as `jobSheet` reads Job Actions. */
export const breakdownSheet = (breakdown: Pick<BreakdownDetail, 'actions'>) => actionSheet(breakdown.actions);

export type BreakdownSheet = ReturnType<typeof breakdownSheet>;

export const REPORTED_COLUMN_ID = 'reportedAt';
export const URGENCY_COLUMN_ID = 'urgency';
export const SUBJECT_COLUMN_ID = 'subject';
export const JOB_COLUMN_ID = 'job';
export const FARM_COLUMN_ID = 'farm';
export const REPORTER_COLUMN_ID = 'reporter';
export const MECHANIC_COLUMN_ID = 'mechanic';
export const STATUS_COLUMN_ID = 'status';

/** A subject as the Subject column filter holds it: Machines and Implements share one list. */
export const subjectFilterValue = (subject: BreakdownSubjectRef) => `${subject.kind}:${subject.id}`;

/** Everything the Workshop's column filters ask of the Breakdown list. */
export function workshopListFilters(columnFilters: ColumnFiltersState) {
  const subjects = readMultiSelectFilter(columnFilters, SUBJECT_COLUMN_ID);
  const idsOf = (kind: BreakdownSubjectRef['kind']) =>
    subjects.filter((value) => value.startsWith(`${kind}:`)).map((value) => value.slice(kind.length + 1));
  const { start, end } = readDateRangeFilter(columnFilters, REPORTED_COLUMN_ID);
  const reportedFrom = DateOnlyIso.safeParse(start).data;
  const reportedTo = DateOnlyIso.safeParse(end).data;
  return {
    statuses: listedStatuses(columnFilters),
    urgencies: listedUrgencies(columnFilters),
    machineIds: idsOf('machine'),
    implementIds: idsOf('implement'),
    jobIds: readMultiSelectFilter(columnFilters, JOB_COLUMN_ID),
    farmIds: readMultiSelectFilter(columnFilters, FARM_COLUMN_ID),
    reporterUserIds: readMultiSelectFilter(columnFilters, REPORTER_COLUMN_ID),
    mechanicUserIds: readMultiSelectFilter(columnFilters, MECHANIC_COLUMN_ID),
    ...(reportedFrom ? { reportedFrom } : {}),
    ...(reportedTo ? { reportedTo } : {}),
  } satisfies Partial<BreakdownListInput>;
}

/** What the queue asks the server for: the picked statuses, or every unsolved one when none is picked. */
export function listedStatuses(columnFilters: ColumnFiltersState): BreakdownStatus[] {
  const picked = readMultiSelectFilter(columnFilters, STATUS_COLUMN_ID);
  const statuses = breakdownStatuses.filter((status) => picked.includes(status));
  return statuses.length ? statuses : [...unsolvedBreakdownStatuses];
}

/** The urgencies picked in the Urgency column filter; none picked lists every urgency. */
export function listedUrgencies(columnFilters: ColumnFiltersState): BreakdownUrgency[] {
  const picked = readMultiSelectFilter(columnFilters, URGENCY_COLUMN_ID);
  return breakdownUrgencies.filter((urgency) => picked.includes(urgency));
}

/** Exactly these statuses are picked. */
export const isPickedStatuses = (columnFilters: ColumnFiltersState, statuses: readonly BreakdownStatus[]) =>
  isPickedExactly(columnFilters, STATUS_COLUMN_ID, statuses);

/**
 * The status quick filters: each unsolved one holding a Breakdown, and one picked on its own even once it empties,
 * so pressing it again can clear it. Solved is reached through All or the Status column filter.
 */
export const quickFilterStatuses = (counts: BreakdownStatusCounts | undefined, columnFilters: ColumnFiltersState) =>
  unsolvedBreakdownStatuses.filter(
    (status) => (counts?.[status] ?? 0) > 0 || isPickedStatuses(columnFilters, [status]),
  );

/** Picks exactly these statuses; pressing again clears the pick. */
export const toggleStatuses = (columnFilters: ColumnFiltersState, statuses: readonly BreakdownStatus[]) =>
  togglePick(columnFilters, STATUS_COLUMN_ID, statuses);

export type ReportValues = { description: string; urgency: BreakdownUrgency; jobId: string };

/**
 * The report fields that differ from what was last saved, so a save never rewrites a field someone else may have
 * changed since this page loaded; `patchBreakdown` keeps every omitted field.
 */
export function reportPatchInput(id: string, saved: ReportValues, values: ReportValues): BreakdownPatchInput {
  return {
    id,
    ...(values.description === saved.description ? {} : { description: values.description }),
    ...(values.urgency === saved.urgency ? {} : { urgency: values.urgency }),
    ...(values.jobId === saved.jobId ? {} : { jobId: values.jobId || null }),
  };
}
