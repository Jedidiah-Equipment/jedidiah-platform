import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { UUID } from '../../common/uuid.js';
import { ReadingComment, ReadingReason, ReadingValue } from '../readings/reading.js';

/** The two Job Hours a Machine Assignment holds. */
export const jobHoursRoles = ['arrival', 'departure'] as const;
export type JobHoursRole = (typeof jobHoursRoles)[number];

/** What an arrival may change on its stint as it lands: the Implement and Driver the phone confirmed. */
export const StintOverrides = z
  .object({ implementId: UUID.nullable().optional(), driverUserId: AuthId.nullable().optional() })
  .strict();
export type StintOverrides = z.infer<typeof StintOverrides>;

export const StintHoursCaptureInput = z
  .object({
    assignmentId: UUID,
    role: z.enum(jobHoursRoles),
    hours: ReadingValue,
    comment: ReadingComment.nullable().optional(),
    /** Only an arrival changes the stint's Implement and Driver. */
    stintOverrides: StintOverrides.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.role !== 'arrival' && value.stintOverrides !== undefined)
      ctx.addIssue({ code: 'custom', path: ['stintOverrides'], message: 'Only an arrival can change a stint.' });
  });
export type StintHoursCaptureInput = z.infer<typeof StintHoursCaptureInput>;

export const StintHoursEditInput = z
  .object({
    assignmentId: UUID,
    arrivalHours: ReadingValue,
    /** Null leaves a stint on site; the server refuses clearing a departure that exists. */
    departureHours: ReadingValue.nullable(),
    arrivalComment: ReadingComment.nullable().optional(),
    departureComment: ReadingComment.nullable().optional(),
    /** Required once the Job has a Job Card; the server says so. */
    reason: ReadingReason.optional(),
  })
  .strict();
export type StintHoursEditInput = z.infer<typeof StintHoursEditInput>;

/** John Deere's latest report for a Machine: what a Job Hours capture is compared to. */
export const LatestTelematics = z.object({ hours: ReadingValue, at: DateIso });
export type LatestTelematics = z.infer<typeof LatestTelematics>;

/** One of a stint's Job Hours as it was captured: who saved it, when, and what John Deere had last read then. */
export const JobHoursValue = z.object({
  hours: ReadingValue,
  at: DateIso,
  byUserId: AuthId,
  byName: z.string(),
  comment: z.string().nullable(),
  /** What John Deere had last read when this was captured; null for an unlinked Machine. */
  telematics: LatestTelematics.nullable(),
});
export type JobHoursValue = z.infer<typeof JobHoursValue>;
