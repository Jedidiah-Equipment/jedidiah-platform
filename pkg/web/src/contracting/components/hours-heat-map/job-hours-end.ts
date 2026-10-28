import { toPlantDateOnly } from '@pkg/domain';
import type { DateOnlyIso } from '@pkg/schema';

/**
 * The plant date a Job's heat map should end on: its last departure once every Machine that arrived has left, so a
 * finished Job shows the weeks it was worked rather than the weeks since. Undefined while a Machine is on site or
 * before any has arrived, which ends the map today.
 */
export function jobHoursEnd(
  assignments: readonly { arrival: unknown; departure: { capturedAt: string } | null }[],
): DateOnlyIso | undefined {
  const started = assignments.filter((assignment) => assignment.arrival !== null);
  const departures = started.flatMap((assignment) => (assignment.departure ? [assignment.departure.capturedAt] : []));
  if (started.length === 0 || departures.length < started.length) return undefined;
  return toPlantDateOnly(new Date(departures.reduce((latest, at) => (at > latest ? at : latest))));
}
