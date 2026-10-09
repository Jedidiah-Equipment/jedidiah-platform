import type { BreakdownSubjectKind } from '@pkg/schema/contracting';

/** What placing a Breakdown needs of a stint: its subject ids and when it arrived and left. */
export type PlacedStint = {
  id: string;
  machineId: string;
  implementId: string | null;
  createdAt: string;
  arrival: { capturedAt: string } | null;
  departure: { capturedAt: string } | null;
};
export type PlacedBreakdown = { subject: { kind: BreakdownSubjectKind; id: string }; reportedAt: string };

const onSiteAt = (stint: PlacedStint, at: string) =>
  stint.arrival !== null &&
  stint.arrival.capturedAt <= at &&
  (stint.departure === null || at < stint.departure.capturedAt);

/**
 * Each stint's Breakdowns on one Job. A Breakdown names its Machine or Implement and the Job, not a stint, so it goes
 * to the stint of its subject that was on site when it was reported; failing that, the last one that had arrived by
 * then; failing that (reported before any arrival), the earliest planned one. A Breakdown whose subject is on no stint
 * any more — its Implement swapped out, its planned stint removed — is `unplaced`, never dropped.
 */
export function breakdownsByStint<TBreakdown extends PlacedBreakdown>(
  stints: readonly PlacedStint[],
  breakdowns: readonly TBreakdown[],
): { byStint: Map<string, TBreakdown[]>; unplaced: TBreakdown[] } {
  const byStint = new Map<string, TBreakdown[]>();
  const unplaced: TBreakdown[] = [];
  for (const breakdown of breakdowns) {
    const { kind, id } = breakdown.subject;
    const candidates = stints.filter((stint) => (kind === 'machine' ? stint.machineId : stint.implementId) === id);
    const arrivedBefore = candidates
      .filter((stint) => stint.arrival !== null && stint.arrival.capturedAt <= breakdown.reportedAt)
      .sort((left, right) => (left.arrival?.capturedAt ?? '').localeCompare(right.arrival?.capturedAt ?? ''));
    const stint =
      candidates.find((candidate) => onSiteAt(candidate, breakdown.reportedAt)) ??
      arrivedBefore.at(-1) ??
      [...candidates].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    if (stint) byStint.set(stint.id, [...(byStint.get(stint.id) ?? []), breakdown]);
    else unplaced.push(breakdown);
  }
  return { byStint, unplaced };
}

/** A stint's Breakdowns, oldest first, split around its arrival and departure by when each was reported. */
export function breakdownPhases<TBreakdown extends Pick<PlacedBreakdown, 'reportedAt'>>(
  stint: Pick<PlacedStint, 'arrival' | 'departure'>,
  breakdowns: readonly TBreakdown[],
) {
  const sorted = [...breakdowns].sort((left, right) => left.reportedAt.localeCompare(right.reportedAt));
  const arrivedAt = stint.arrival?.capturedAt ?? null;
  const departedAt = stint.departure?.capturedAt ?? null;
  return {
    beforeArrival: sorted.filter(({ reportedAt }) => arrivedAt === null || reportedAt < arrivedAt),
    onSite: sorted.filter(
      ({ reportedAt }) =>
        arrivedAt !== null && reportedAt >= arrivedAt && (departedAt === null || reportedAt < departedAt),
    ),
    afterDeparture: sorted.filter(({ reportedAt }) => departedAt !== null && reportedAt >= departedAt),
  };
}
