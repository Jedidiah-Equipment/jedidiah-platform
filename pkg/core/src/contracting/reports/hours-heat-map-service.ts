import type { Db } from '@pkg/db';
import { contractingHourReadings, contractingMachineAssignments } from '@pkg/db/contracting';
import {
  addDateOnlyDays,
  getPlantDateNow,
  groupBy,
  JOHANNESBURG_TIME_ZONE,
  zonedDateStartToUtcInstant,
} from '@pkg/domain';
import {
  allocateDailyHours,
  type DailyHoursStint,
  isValidHoursHeatMapRange,
  type MeterSegment,
  meterSegments,
  resolveHoursHeatMapRange,
  segmentsWithinStints,
} from '@pkg/domain/contracting';
import type { DateOnlyIso } from '@pkg/schema';
import { HoursHeatMap, type HoursHeatMapInput } from '@pkg/schema/contracting';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { oldestFirst } from '../readings/reading-sql.js';
import { ReportError } from './report-errors.js';

const arrival = alias(contractingHourReadings, 'heat_map_arrival');
const departure = alias(contractingHourReadings, 'heat_map_departure');

type LedgerPoint = { machineId: string; value: number; capturedAt: Date };

/** The stints of the given Jobs (on the given Machines, when named) that have started, as the instants of their readings. */
async function loadStints(db: Db, jobIds: string[], machineIds: string[] | undefined) {
  const rows = await db
    .select({
      machineId: contractingMachineAssignments.machineId,
      arrivalAt: arrival.capturedAt,
      departureAt: departure.capturedAt,
    })
    .from(contractingMachineAssignments)
    .innerJoin(arrival, eq(arrival.id, contractingMachineAssignments.arrivalReadingId))
    .leftJoin(departure, eq(departure.id, contractingMachineAssignments.departureReadingId))
    .where(
      and(
        inArray(contractingMachineAssignments.jobId, jobIds),
        isNotNull(contractingMachineAssignments.arrivalReadingId),
        machineIds ? inArray(contractingMachineAssignments.machineId, machineIds) : undefined,
      ),
    );
  return groupBy(
    rows.map(({ machineId, arrivalAt, departureAt }) => ({
      machineId,
      stint: { arrivalAt: arrivalAt.toISOString(), departureAt: departureAt?.toISOString() ?? null },
    })),
    (row) => row.machineId,
  );
}

/**
 * The readings inside the range plus, per Machine, the one just before it and the one just after it: the neighbours
 * the first and last segments run to. Three queries over the `(machine, Read At)` index; nothing reads a whole ledger.
 */
async function loadLedgers(db: Db, range: { from: Date; to: Date }, machineFilter: SQL | undefined) {
  const columns = {
    machineId: contractingHourReadings.machineId,
    value: contractingHourReadings.value,
    capturedAt: contractingHourReadings.capturedAt,
  };
  const [before, inside, after] = await Promise.all([
    db
      .selectDistinctOn([contractingHourReadings.machineId], columns)
      .from(contractingHourReadings)
      .where(and(lt(contractingHourReadings.capturedAt, range.from), machineFilter))
      .orderBy(
        asc(contractingHourReadings.machineId),
        desc(contractingHourReadings.capturedAt),
        desc(contractingHourReadings.sequence),
      ),
    db
      .select(columns)
      .from(contractingHourReadings)
      .where(
        and(
          gte(contractingHourReadings.capturedAt, range.from),
          lt(contractingHourReadings.capturedAt, range.to),
          machineFilter,
        ),
      )
      .orderBy(asc(contractingHourReadings.machineId), ...oldestFirst),
    db
      .selectDistinctOn([contractingHourReadings.machineId], columns)
      .from(contractingHourReadings)
      .where(and(gte(contractingHourReadings.capturedAt, range.to), machineFilter))
      .orderBy(
        asc(contractingHourReadings.machineId),
        asc(contractingHourReadings.capturedAt),
        asc(contractingHourReadings.sequence),
      ),
  ]);
  const ledgers = new Map<string, LedgerPoint[]>();
  // Before, inside and after are each in Read At order and in that order in time, so appending keeps the ledger sorted.
  for (const point of [...before, ...inside, ...after]) {
    const ledger = ledgers.get(point.machineId) ?? [];
    ledger.push(point);
    ledgers.set(point.machineId, ledger);
  }
  return ledgers;
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
  if (!isValidHoursHeatMapRange(range)) {
    throw new ReportError('report.invalid_range', 'The heat map range must run forwards and span at most a year.');
  }
  const machineIds = input.machineIds?.length ? input.machineIds : undefined;
  const jobIds = input.jobIds?.length ? input.jobIds : undefined;
  const stintsByMachine = jobIds ? await loadStints(db, jobIds, machineIds) : null;
  const scopedMachineIds = stintsByMachine ? [...stintsByMachine.keys()] : machineIds;
  const segments: MeterSegment[] = [];
  if (!scopedMachineIds || scopedMachineIds.length > 0) {
    const ledgers = await loadLedgers(
      db,
      {
        from: zonedDateStartToUtcInstant(range.start, JOHANNESBURG_TIME_ZONE),
        to: zonedDateStartToUtcInstant(addDateOnlyDays(range.end, 1), JOHANNESBURG_TIME_ZONE),
      },
      scopedMachineIds ? inArray(contractingHourReadings.machineId, scopedMachineIds) : undefined,
    );
    for (const [machineId, ledger] of ledgers) {
      const machineSegments = meterSegments(
        ledger.map((point) => ({ value: point.value, capturedAt: point.capturedAt.toISOString() })),
      );
      const stints: DailyHoursStint[] | undefined = stintsByMachine?.get(machineId)?.map((row) => row.stint);
      segments.push(...(stints ? segmentsWithinStints(machineSegments, stints) : machineSegments));
    }
  }
  return HoursHeatMap.parse({ ...range, days: allocateDailyHours(segments, range.start, range.end) });
}
