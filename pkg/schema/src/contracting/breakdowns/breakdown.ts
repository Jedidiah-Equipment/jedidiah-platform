import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../../common/date.js';
import { createCursorQueryResult, createSearchedSortedCursorQueryInput } from '../../common/pagination.js';
import { UUID } from '../../common/uuid.js';
import { CategoryColour, CategoryIconKey } from '../fleet/fleet.js';
import { BreakdownActions } from './breakdown-actions.js';
import {
  breakdownStatuses,
  breakdownSubjectKinds,
  breakdownUrgencies,
  unsolvedBreakdownStatuses,
} from './breakdown-enums.js';

export const BreakdownDescription = z.string().trim().min(1, 'Describe the problem').max(4000);
export const BreakdownNoteText = z.string().trim().min(1).max(4000);
export const CloseOutNote = z.string().trim().min(1, 'A close-out note is required').max(4000);
export const Latitude = z.number().min(-90).max(90);
export const Longitude = z.number().min(-180).max(180);
export const BreakdownSubjectRef = z.object({ kind: z.enum(breakdownSubjectKinds), id: UUID }).strict();
export type BreakdownSubjectRef = z.infer<typeof BreakdownSubjectRef>;

export const BreakdownReportInput = z
  .object({
    /** Idempotent replay, like `ReadingCaptureInput.localId`. */
    localId: UUID.optional(),
    subject: BreakdownSubjectRef,
    /** Omitted: the server defaults it from the subject's on-site stint. `null`: explicitly no Job. */
    jobId: UUID.nullable().optional(),
    urgency: z.enum(breakdownUrgencies),
    description: BreakdownDescription,
    latitude: Latitude.nullable().optional(),
    longitude: Longitude.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (((value.latitude ?? null) === null) !== ((value.longitude ?? null) === null))
      ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Send both coordinates or neither.' });
  });
export type BreakdownReportInput = z.infer<typeof BreakdownReportInput>;
type BreakdownReportFields = z.input<typeof BreakdownReportInput>;
export const breakdownReportFieldNames = BreakdownReportInput.keyof().options;

/**
 * The multipart wire form of {@link BreakdownReportInput}: every field travels as a string beside the
 * photo parts. `breakdownReportMultipartFields` encodes and `BreakdownReportMultipart` decodes, so the
 * mobile uploader and the API route share one spelling of the subject, the numbers and blank-means-null.
 */
export function breakdownReportMultipartFields(input: BreakdownReportFields): [string, string][] {
  return breakdownReportFieldNames.flatMap((field) => {
    const value = input[field];
    return value === undefined
      ? []
      : [[field, value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)]];
  });
}
const blankAsNull = (value: unknown) => (value === '' ? null : value);
const asNumber = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value);
export const BreakdownReportMultipart = z.preprocess((fields) => {
  if (typeof fields !== 'object' || fields === null) return fields;
  const record = { ...(fields as Record<string, unknown>) };
  if (typeof record.subject === 'string') {
    try {
      record.subject = JSON.parse(record.subject);
    } catch {
      // Left as the string so the schema refuses it.
    }
  }
  for (const field of ['jobId', 'latitude', 'longitude'] as const) {
    if (record[field] === undefined) continue;
    record[field] = field === 'jobId' ? blankAsNull(record[field]) : asNumber(blankAsNull(record[field]));
  }
  return record;
}, BreakdownReportInput);

export const BreakdownPatchInput = z
  .object({
    id: UUID,
    description: BreakdownDescription.optional(),
    urgency: z.enum(breakdownUrgencies).optional(),
    jobId: UUID.nullable().optional(),
  })
  .strict();
export type BreakdownPatchInput = z.infer<typeof BreakdownPatchInput>;
export const BreakdownAssignMechanicInput = z.object({ id: UUID, mechanicUserId: AuthId.nullable() }).strict();
export type BreakdownAssignMechanicInput = z.infer<typeof BreakdownAssignMechanicInput>;
export const BreakdownStartInput = z.object({ id: UUID }).strict();
export const BreakdownSolveInput = z.object({ id: UUID, closeOutNote: CloseOutNote }).strict();
export type BreakdownSolveInput = z.infer<typeof BreakdownSolveInput>;
export const BreakdownNoteCreateInput = z.object({ breakdownId: UUID, text: BreakdownNoteText }).strict();
export type BreakdownNoteCreateInput = z.infer<typeof BreakdownNoteCreateInput>;
export const BreakdownIdInput = z.object({ id: UUID }).strict();
export const BreakdownPhotoRemoveInput = z.object({ id: UUID, photoId: UUID }).strict();
export type BreakdownPhotoRemoveInput = z.infer<typeof BreakdownPhotoRemoveInput>;

export const BreakdownPhoto = z.object({
  id: UUID,
  byteSize: z.number().int(),
  contentType: z.string(),
  storageKey: z.string(),
  updatedAt: DateIso,
});
export type BreakdownPhoto = z.infer<typeof BreakdownPhoto>;
export const BreakdownSubject = z.object({
  kind: z.enum(breakdownSubjectKinds),
  id: UUID,
  code: z.string(),
  categoryName: z.string(),
  categoryIcon: CategoryIconKey,
  categoryColour: CategoryColour,
});
export type BreakdownSubject = z.infer<typeof BreakdownSubject>;
export const BreakdownSummary = z.object({
  id: UUID,
  subject: BreakdownSubject,
  jobId: UUID.nullable(),
  jobNumber: z.string().nullable(),
  jobForemanUserId: AuthId.nullable(),
  farmId: UUID.nullable(),
  farmName: z.string().nullable(),
  urgency: z.enum(breakdownUrgencies),
  status: z.enum(breakdownStatuses),
  reportedAt: DateIso,
  reportedByUserId: AuthId,
  reporterName: z.string(),
  primaryMechanicUserId: AuthId.nullable(),
  mechanicName: z.string().nullable(),
  firstLine: z.string(),
  photoCount: z.number().int(),
  noteCount: z.number().int(),
  /** The note's first line when there is exactly one, so a list can show it in place of a count. */
  soleNote: z.string().nullable(),
  startedAt: DateIso.nullable(),
  solvedAt: DateIso.nullable(),
  /** Other unsolved Breakdowns on the same Job — the dispatch cross-reference, derived. */
  sameJobOpenCount: z.number().int(),
});
export type BreakdownSummary = z.infer<typeof BreakdownSummary>;
export const BreakdownNote = z.object({
  id: UUID,
  breakdownId: UUID,
  authorUserId: AuthId,
  authorName: z.string(),
  text: BreakdownNoteText,
  createdAt: DateIso,
});
export type BreakdownNote = z.infer<typeof BreakdownNote>;
export const BreakdownDispatchHint = z.object({
  breakdownId: UUID,
  subject: BreakdownSubject,
  urgency: z.enum(breakdownUrgencies),
  status: z.enum(breakdownStatuses),
  firstLine: z.string(),
});
export type BreakdownDispatchHint = z.infer<typeof BreakdownDispatchHint>;
export const BreakdownDetail = BreakdownSummary.extend({
  description: BreakdownDescription,
  latitude: Latitude.nullable(),
  longitude: Longitude.nullable(),
  photos: BreakdownPhoto.array(),
  closeOutNote: CloseOutNote.nullable(),
  solvedByName: z.string().nullable(),
  notes: BreakdownNote.array(),
  dispatchHints: BreakdownDispatchHint.array(),
  actions: BreakdownActions,
});
export type BreakdownDetail = z.infer<typeof BreakdownDetail>;
export const BreakdownListInput = createSearchedSortedCursorQueryInput({
  defaultSortDirection: 'desc',
  shape: {
    statuses: z.array(z.enum(breakdownStatuses)).default([...unsolvedBreakdownStatuses]),
    urgencies: z.array(z.enum(breakdownUrgencies)).default([]),
    machineId: UUID.optional(),
    implementId: UUID.optional(),
    jobId: UUID.optional(),
    /** Machines and Implements together: a Breakdown on any of them matches. */
    machineIds: z.array(UUID).default([]),
    implementIds: z.array(UUID).default([]),
    jobIds: z.array(UUID).default([]),
    farmIds: z.array(UUID).default([]),
    reporterUserIds: z.array(AuthId).default([]),
    mechanicUserIds: z.array(AuthId).default([]),
    /** Keep only Breakdowns reported on or after this South African calendar day. */
    reportedFrom: DateOnlyIso.optional(),
    /** Keep only Breakdowns reported on or before this South African calendar day. */
    reportedTo: DateOnlyIso.optional(),
  },
  sortBy: z.enum(['reportedAt', 'urgency']).default('reportedAt'),
});
export type BreakdownListInput = z.infer<typeof BreakdownListInput>;
export const BreakdownListResult = createCursorQueryResult(BreakdownSummary);
export type BreakdownListResult = z.infer<typeof BreakdownListResult>;
export const BreakdownStatusCounts = z.record(z.enum(breakdownStatuses), z.number().int().nonnegative());
export type BreakdownStatusCounts = z.infer<typeof BreakdownStatusCounts>;
/** Each status's Breakdown count, and the unsolved Code Reds the nav warns about. */
export const BreakdownQueueSummary = z.object({
  counts: BreakdownStatusCounts,
  codeRedUnsolved: z.number().int().nonnegative(),
});
export type BreakdownQueueSummary = z.infer<typeof BreakdownQueueSummary>;
/** What the Workshop table's column filters offer: only values some readable Breakdown carries. */
export const BreakdownFilterOptions = z.object({
  subjects: z.object({ kind: z.enum(breakdownSubjectKinds), id: UUID, code: z.string() }).array(),
  jobs: z.object({ id: UUID, jobNumber: z.string() }).array(),
  farms: z.object({ id: UUID, name: z.string() }).array(),
  reporters: z.object({ id: AuthId, name: z.string() }).array(),
});
export type BreakdownFilterOptions = z.infer<typeof BreakdownFilterOptions>;
export const Mechanic = z.object({ id: AuthId, name: z.string() });
export type Mechanic = z.infer<typeof Mechanic>;
/** An open Job a Breakdown's subject is planned or on site on: what its Job may be changed to. */
export const BreakdownJobOption = z.object({ id: UUID, jobNumber: z.string(), farmName: z.string() });
export type BreakdownJobOption = z.infer<typeof BreakdownJobOption>;
