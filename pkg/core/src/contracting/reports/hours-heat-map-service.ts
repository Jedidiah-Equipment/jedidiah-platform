import type { Db } from '@pkg/db';
import { contractingHourReadings, contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import {
  addDateOnlyDays,
  getPlantDateNow,
  groupBy,
  JOHANNESBURG_TIME_ZONE,
  zonedDateStartToUtcInstant,
} from '@pkg/domain';
import {
  allocateDailyHours,
  type MeterSegment,
  meterSegments,
  resolveHoursHeatMapRange,
  stintWorkSegments,
} from '@pkg/domain/contracting';
import type { DateOnlyIso } from '@pkg/schema';
import { HoursHeatMap, type HoursHeatMapInput, isValidHoursHeatMapRange } from '@pkg/schema/contracting';
import { and, asc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { oldestFirst } from '../readings/reading-sql.js';
import { reportInvalidRange } from './report-errors.js';

const neighbourName = 'heat_map_neighbour';
const neighbour = alias(contractingHourReadings, neighbourName);

type LedgerPoint = { id: string; machineId: string; sequence: number; value: number; capturedAt: Date };

/** The started stints of the given Jobs (on the given Machines, when named), by Machine. */
async function loadStints(db: Db, jobIds: string[], machineIds: string[] | undefined) {
  const rows = await db
    .select({
      machineId: contractingMachineAssignments.machineId,
      arrivalReadingId: contractingMachineAssignments.arrivalReadingId,
      departureReadingId: contractingMachineAssignments.departureReadingId,
    })
    .from(contractingMachineAssignments)
    .where(
      and(
        inArray(contractingMachineAssignments.jobId, jobIds),
        isNotNull(contractingMachineAssignments.arrivalReadingId),
        machineIds ? inArray(contractingMachineAssignments.machineId, machineIds) : undefined,
      ),
    );
  return groupBy(
    rows.flatMap(({ machineId, arrivalReadingId, departureReadingId }) =>
      arrivalReadingId ? [{ machineId, stint: { arrivalReadingId, departureReadingId } }] : [],
    ),
    (row) => row.machineId,
  );
}

/**
 * The reading nearest the range on one side, per Machine, found by an index probe on `(machine, Read At, sequence)`
 * for each Machine rather than a scan of everything before or after it.
 */
const nearestReadingId = (side: 'before' | 'after', instant: Date) => {
  const iso = instant.toISOString();
  return side === 'before'
    ? sql`(select ${neighbour.id} from ${contractingHourReadings} ${sql.raw(neighbourName)} where ${neighbour.machineId} = ${contractingMachines.id} and ${neighbour.capturedAt} < ${iso}::timestamptz order by ${neighbour.capturedAt} desc, ${neighbour.sequence} desc limit 1)`
    : sql`(select ${neighbour.id} from ${contractingHourReadings} ${sql.raw(neighbourName)} where ${neighbour.machineId} = ${contractingMachines.id} and ${neighbour.capturedAt} >= ${iso}::timestamptz order by ${neighbour.capturedAt} asc, ${neighbour.sequence} asc limit 1)`;
};

/**
 * The readings inside the range plus, per Machine, the one just before it and the one just after it: the neighbours
 * the first and last segments run to. Nothing reads a whole ledger.
 */
async function loadLedgers(
  db: Db,
  range: { from: Date; to: Date },
  machineIds: string[] | undefined,
  stintReadingIds: string[],
) {
  const columns = {
    id: contractingHourReadings.id,
    sequence: contractingHourReadings.sequence,
    machineId: contractingHourReadings.machineId,
    value: contractingHourReadings.value,
    capturedAt: contractingHourReadings.capturedAt,
  };
  const nearest = (side: 'before' | 'after') =>
    db
      .select(columns)
      .from(contractingMachines)
      .innerJoin(
        contractingHourReadings,
        eq(contractingHourReadings.id, nearestReadingId(side, side === 'before' ? range.from : range.to)),
      )
      .where(machineIds ? inArray(contractingMachines.id, machineIds) : undefined);
  const [before, inside, after, stintReadings] = await Promise.all([
    nearest('before'),
    db
      .select(columns)
      .from(contractingHourReadings)
      .where(
        and(
          gte(contractingHourReadings.capturedAt, range.from),
          lt(contractingHourReadings.capturedAt, range.to),
          machineIds ? inArray(contractingHourReadings.machineId, machineIds) : undefined,
        ),
      )
      .orderBy(asc(contractingHourReadings.machineId), ...oldestFirst),
    nearest('after'),
    // A Job's stints are walked by their arrival and departure readings, so those are in the ledger wherever they fall.
    stintReadingIds.length > 0
      ? db.select(columns).from(contractingHourReadings).where(inArray(contractingHourReadings.id, stintReadingIds))
      : [],
  ]);
  const ledgers = new Map<string, Map<string, LedgerPoint>>();
  for (const point of [...before, ...inside, ...after, ...stintReadings]) {
    const ledger = ledgers.get(point.machineId) ?? new Map<string, LedgerPoint>();
    ledger.set(point.id, point);
    ledgers.set(point.machineId, ledger);
  }
  // Read At orders the ledger and acceptance breaks a tie, as everywhere else.
  return new Map(
    [...ledgers].map(([machineId, ledger]) => [
      machineId,
      [...ledger.values()].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime() || a.sequence - b.sequence),
    ]),
  );
}

/**
 * Daily Hours across the selected Machines, summed per plant day. Unfiltered or per Machine every meter delta counts;
 * under Jobs only the Work hours inside those Jobs' stints do.
 */
export async function getHoursHeatMap({
  db,
  input,
  today = getPlantDateNow(),
}: {
  db: Db;
  input: HoursHeatMapInput;
  today?: DateOnlyIso;
}): Promise<HoursHeatMap> {
  const range = resolveHoursHeatMapRange(input, today);
  // A range that starts after today has no day left to show once its end is capped.
  if (range.start > today) return HoursHeatMap.parse({ ...range, days: [] });
  if (!isValidHoursHeatMapRange(range)) {
    throw reportInvalidRange();
  }
  const machineIds = input.machineIds?.length ? input.machineIds : undefined;
  const jobIds = input.jobIds?.length ? input.jobIds : undefined;
  const stintsByMachine = jobIds ? await loadStints(db, jobIds, machineIds) : null;
  const stintReadingIds = [...(stintsByMachine?.values() ?? [])].flatMap((rows) =>
    rows.flatMap(({ stint }) => [
      stint.arrivalReadingId,
      ...(stint.departureReadingId ? [stint.departureReadingId] : []),
    ]),
  );
  const scopedMachineIds = stintsByMachine ? [...stintsByMachine.keys()] : machineIds;
  const segments: MeterSegment[] = [];
  if (!scopedMachineIds || scopedMachineIds.length > 0) {
    const ledgers = await loadLedgers(
      db,
      {
        from: zonedDateStartToUtcInstant(range.start, JOHANNESBURG_TIME_ZONE),
        to: zonedDateStartToUtcInstant(addDateOnlyDays(range.end, 1), JOHANNESBURG_TIME_ZONE),
      },
      scopedMachineIds,
      stintReadingIds,
    );
    for (const [machineId, ledger] of ledgers) {
      const readings = ledger.map((point) => ({
        id: point.id,
        value: point.value,
        capturedAt: point.capturedAt.toISOString(),
      }));
      const stints = stintsByMachine?.get(machineId)?.map((row) => row.stint);
      segments.push(...(stints ? stintWorkSegments(readings, stints) : meterSegments(readings)));
    }
  }
  return HoursHeatMap.parse({ ...range, days: allocateDailyHours(segments, range.start, range.end) });
}
