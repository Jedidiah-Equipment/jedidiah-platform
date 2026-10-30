import { formatHours, groupBy } from '@pkg/domain';
import { snapshotTravelHours } from '@pkg/domain/contracting';
import type { SnapshotRow } from './snapshot-table-definitions.js';

type Reading = SnapshotRow & { id: string; machineId: string; value: number; sequence: number };

const READINGS = 'contracting_hour_reading';
const STINTS = 'contracting_machine_assignment';
const time = (value: unknown) => (value == null ? null : new Date(value as string | Date));
const before = (a: Reading, b: Reading) => {
  const difference = Number(time(a.capturedAt)) - Number(time(b.capturedAt));
  return difference < 0 || (difference === 0 && a.sequence < b.sequence);
};

/**
 * A snapshot read before migration 0185 keeps Job Hours as arrival and departure readings in the ledger. Fold them onto
 * their stints the way the migration did, Travel and a departure below its arrival included, and drop them from the ledger. A current snapshot passes
 * through unchanged. Temporary: delete this fold once the snapshot is regenerated after 0185 runs in production.
 */
export function foldLegacyJobHours(rowsByTable: Map<string, SnapshotRow[]>): void {
  const readings = (rowsByTable.get(READINGS) ?? []) as Reading[];
  if (!readings.some((reading) => reading.role === 'arrival' || reading.role === 'departure')) return;
  const byId = new Map(readings.map((reading) => [reading.id, reading]));
  const departuresByMachine = groupBy(
    readings.filter((reading) => reading.role === 'departure'),
    (reading) => reading.machineId,
  );
  const previousDeparture = (arrival: Reading) =>
    (departuresByMachine.get(arrival.machineId) ?? [])
      .filter((departure) => before(departure, arrival))
      .reduce<Reading | undefined>(
        (latest, departure) => (!latest || before(latest, departure) ? departure : latest),
        undefined,
      );
  const side = (prefix: 'arrival' | 'departure', reading: Reading | undefined) => ({
    [`${prefix}Hours`]: reading?.value ?? null,
    [`${prefix}At`]: reading ? time(reading.createdAt ?? reading.capturedAt) : null,
    [`${prefix}ByUserId`]: reading?.capturedByUserId ?? null,
    [`${prefix}Comment`]: reading?.comment ?? null,
    [`${prefix}TelematicsHours`]: null,
    [`${prefix}TelematicsAt`]: null,
  });
  rowsByTable.set(
    STINTS,
    (rowsByTable.get(STINTS) ?? []).map((stint) => {
      const arrival = byId.get(stint.arrivalReadingId as string);
      const departure = byId.get(stint.departureReadingId as string);
      const amended = [arrival, departure]
        .filter((reading): reading is Reading => reading?.amendedAt != null)
        .sort((a, b) => Number(time(b.amendedAt)) - Number(time(a.amendedAt)))[0];
      const travelHours = !arrival
        ? null
        : ((stint.gapTravelHours as number | null) ??
          (stint.travelIncluded
            ? snapshotTravelHours(arrival.value, previousDeparture(arrival)?.value ?? null).travelHours
            : 0));
      const below = arrival && departure && departure.value < arrival.value ? departure : null;
      return {
        ...stint,
        ...side('arrival', arrival),
        ...side('departure', departure),
        ...(below
          ? {
              departureHours: arrival?.value,
              hoursAmendedAt: new Date(),
              hoursAmendedByUserId: below.capturedByUserId,
              hoursAmendmentReason: `Departure ${formatHours(below.value)} was below the arrival; set to the arrival when Job Hours moved onto the stint.`,
            }
          : {
              hoursAmendedAt: time(amended?.amendedAt),
              hoursAmendedByUserId: amended?.amendedBy ?? null,
              hoursAmendmentReason: amended?.amendmentReason ?? null,
            }),
        travelHours,
        travelClamped: false,
        travelSetAt: arrival ? time(stint.gapResolvedAt) : null,
        travelSetByUserId: arrival ? (stint.gapResolvedByUserId ?? null) : null,
      };
    }),
  );
  rowsByTable.set(
    READINGS,
    readings.filter((reading) => reading.role !== 'arrival' && reading.role !== 'departure'),
  );
}
