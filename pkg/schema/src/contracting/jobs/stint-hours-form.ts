import { z } from 'zod';
import type { UUID } from '../../common/uuid.js';
import { ReadingComment, ReadingReason, ReadingValue } from '../readings/reading.js';
import { type JobHoursRole, StintHoursCaptureInput, StintHoursEditInput, type StintOverrides } from './stint-hours.js';

/** A blank or whitespace-only text field is no comment. */
const BlankOr = <T extends z.ZodTypeAny>(content: T) => z.union([z.string().trim().length(0), content]);
const orNull = (text: string) => text.trim() || null;

/** The Job Hours capture form as both the web and the phone hold it, once the hours are parsed to a number. */
export const StintHoursCaptureValues = z.object({ hours: ReadingValue, comment: BlankOr(ReadingComment) });
export type StintHoursCaptureValues = z.infer<typeof StintHoursCaptureValues>;

export function toStintHoursCaptureInput(
  stint: { assignmentId: UUID; role: JobHoursRole },
  values: StintHoursCaptureValues,
  stintOverrides?: StintOverrides,
): StintHoursCaptureInput {
  return StintHoursCaptureInput.parse({
    ...stint,
    hours: values.hours,
    comment: orNull(values.comment),
    ...(stintOverrides ? { stintOverrides } : {}),
  });
}

/** The Edit hours form; the departure is null while the Machine is still on site. */
export const StintHoursEditValues = z.object({
  arrivalHours: ReadingValue,
  departureHours: ReadingValue.nullable(),
  arrivalComment: BlankOr(ReadingComment),
  departureComment: BlankOr(ReadingComment),
  reason: BlankOr(ReadingReason),
});
export type StintHoursEditValues = z.infer<typeof StintHoursEditValues>;

export function toStintHoursEditInput(assignmentId: UUID, values: StintHoursEditValues): StintHoursEditInput {
  const reason = values.reason.trim();
  return StintHoursEditInput.parse({
    assignmentId,
    arrivalHours: values.arrivalHours,
    departureHours: values.departureHours,
    arrivalComment: orNull(values.arrivalComment),
    departureComment: values.departureHours === null ? undefined : orNull(values.departureComment),
    ...(reason ? { reason } : {}),
  });
}
