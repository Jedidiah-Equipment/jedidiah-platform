import { z } from 'zod';
import { DateIso, DateOnlyIso } from '../../common/date.js';
import { createCursorQueryResult, createSearchedSortedCursorQueryInput } from '../../common/pagination.js';
import { UUID } from '../../common/uuid.js';
import { BreakdownSubjectRef } from '../breakdowns/breakdown.js';
import { breakdownStatuses, breakdownUrgencies } from '../breakdowns/breakdown-enums.js';
import { readingRoles } from '../readings/reading-enums.js';

export const fleetHistoryKinds = ['reading', 'breakdown', 'service'] as const;
export type FleetHistoryKind = (typeof fleetHistoryKinds)[number];

/** One Machine's or Implement's History: its readings, Breakdowns and services as one newest-first timeline. */
export const FleetHistoryListInput = createSearchedSortedCursorQueryInput({
  defaultSortDirection: 'desc',
  shape: {
    subject: BreakdownSubjectRef,
    /** None lists every kind the caller may read. */
    kinds: z.array(z.enum(fleetHistoryKinds)).default([]),
    /** Keep only what happened on or after this South African calendar day. */
    from: DateOnlyIso.optional(),
    to: DateOnlyIso.optional(),
  },
  sortBy: z.enum(['at', 'kind']).default('at'),
});
export type FleetHistoryListInput = z.infer<typeof FleetHistoryListInput>;

export const FleetHistoryRow = z.object({
  id: UUID,
  kind: z.enum(fleetHistoryKinds),
  /** An instant, or a plant date for a service. */
  at: z.union([DateIso, DateOnlyIso]),
  title: z.string(),
  detail: z.string().nullable(),
  /** The reading's photo and AI evidence, as the stint card labels it, or who reported a Telematics Reading. */
  evidence: z.string().nullable(),
  readingRole: z.enum(readingRoles).nullable(),
  breakdown: z.object({ urgency: z.enum(breakdownUrgencies), status: z.enum(breakdownStatuses) }).nullable(),
  opens: z
    .discriminatedUnion('to', [
      z.object({ to: z.literal('breakdown'), id: UUID }),
      z.object({ to: z.literal('job'), jobNumber: z.string() }),
      z.object({ to: z.literal('service') }),
    ])
    .nullable(),
});
export type FleetHistoryRow = z.infer<typeof FleetHistoryRow>;
export const FleetHistoryListResult = createCursorQueryResult(FleetHistoryRow);
export type FleetHistoryListResult = z.infer<typeof FleetHistoryListResult>;

export const FleetHistoryFilterInput = z.object({ subject: BreakdownSubjectRef });
export type FleetHistoryFilterInput = z.infer<typeof FleetHistoryFilterInput>;
/** The kinds this subject's History holds that the caller may read: the Kind column's choices. */
export const FleetHistoryFilterOptions = z.object({ kinds: z.enum(fleetHistoryKinds).array() });
export type FleetHistoryFilterOptions = z.infer<typeof FleetHistoryFilterOptions>;
