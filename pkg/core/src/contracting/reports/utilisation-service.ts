import type { Db } from '@pkg/db';
import {
  contractingCategories,
  contractingHourReadings,
  contractingMachineAssignments,
  contractingMachines,
} from '@pkg/db/contracting';
import { getPlantDateNow, groupBy, toPlantDateOnly } from '@pkg/domain';
import {
  type ActiveSpan,
  activeDaysIn,
  allocateHours,
  fleetDaysIn,
  type HourSegment,
  hourSegments,
  type LedgerStint,
  resolveReportWindow,
  trailingMonthWindows,
  utilisationPercent,
} from '@pkg/domain/contracting';
import type { DateOnlyIso } from '@pkg/schema';
import {
  type CategoryUtilisation,
  type HourKindTotals,
  type ReportWindow,
  type ReportWindowInput,
  UtilisationReport,
  UtilisationTrend,
  type UtilisationTrendInput,
} from '@pkg/schema/contracting';
import { asc, eq, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getContractingSettings } from '../settings/settings-service.js';
import { ReportError } from './report-errors.js';

/** One Machine with everything the day counts and the ledger walk need, read once for every window. */
type LedgerMachine = {
  id: string;
  code: string;
  categoryId: string;
  category: Pick<CategoryUtilisation, 'name' | 'icon' | 'colour'>;
  createdDate: DateOnlyIso;
  retiredDate: DateOnlyIso | null;
  retiredAt: string | null;
  spans: ActiveSpan[];
  segments: HourSegment[];
};

const arrival = alias(contractingHourReadings, 'report_arrival');
const departure = alias(contractingHourReadings, 'report_departure');

/**
 * Three queries for the whole fleet, retired Machines included, and nothing per Machine. The walk needs the readings
 * either side of a window boundary, so the whole ledger is read; at ~80 Machines and a few readings a stint that is
 * small. If it ever grows, bound the reading load to the trend's twelve months plus one reading either side first.
 */
async function loadFleetLedger(db: Db, gapFlagThresholdHours: number): Promise<LedgerMachine[]> {
  const [machines, readings, stints] = await Promise.all([
    db
      .select({
        id: contractingMachines.id,
        code: contractingMachines.code,
        categoryId: contractingMachines.categoryId,
        createdAt: contractingMachines.createdAt,
        retiredAt: contractingMachines.retiredAt,
        name: contractingCategories.name,
        icon: contractingCategories.icon,
        colour: contractingCategories.colour,
      })
      .from(contractingMachines)
      .innerJoin(contractingCategories, eq(contractingCategories.id, contractingMachines.categoryId))
      .orderBy(asc(contractingCategories.name), asc(contractingMachines.code)),
    db
      .select({
        id: contractingHourReadings.id,
        machineId: contractingHourReadings.machineId,
        role: contractingHourReadings.role,
        value: contractingHourReadings.value,
        capturedAt: contractingHourReadings.capturedAt,
      })
      .from(contractingHourReadings)
      .orderBy(asc(contractingHourReadings.machineId), asc(contractingHourReadings.sequence)),
    db
      .select({
        machineId: contractingMachineAssignments.machineId,
        arrivalReadingId: contractingMachineAssignments.arrivalReadingId,
        departureReadingId: contractingMachineAssignments.departureReadingId,
        gapResolvedAt: contractingMachineAssignments.gapResolvedAt,
        gapTravelHours: contractingMachineAssignments.gapTravelHours,
        gapUnaccountedHours: contractingMachineAssignments.gapUnaccountedHours,
        arrivalAt: arrival.capturedAt,
        departureAt: departure.capturedAt,
      })
      .from(contractingMachineAssignments)
      .innerJoin(arrival, eq(arrival.id, contractingMachineAssignments.arrivalReadingId))
      .leftJoin(departure, eq(departure.id, contractingMachineAssignments.departureReadingId))
      .where(isNotNull(contractingMachineAssignments.arrivalReadingId)),
  ]);
  const readingsByMachine = groupBy(readings, (reading) => reading.machineId);
  const stintsByMachine = groupBy(stints, (stint) => stint.machineId);
  return machines.map((machine) => {
    const own = stintsByMachine.get(machine.id) ?? [];
    const ledgerStints: LedgerStint[] = own.flatMap((stint) =>
      stint.arrivalReadingId
        ? [
            {
              arrivalReadingId: stint.arrivalReadingId,
              departureReadingId: stint.departureReadingId,
              gap:
                stint.gapResolvedAt === null
                  ? null
                  : { travelHours: stint.gapTravelHours ?? 0, unaccountedHours: stint.gapUnaccountedHours ?? 0 },
            },
          ]
        : [],
    );
    const ledger = (readingsByMachine.get(machine.id) ?? []).map((reading) => ({
      ...reading,
      capturedAt: reading.capturedAt.toISOString(),
    }));
    return {
      id: machine.id,
      code: machine.code,
      categoryId: machine.categoryId,
      category: { name: machine.name, icon: machine.icon, colour: machine.colour },
      createdDate: toPlantDateOnly(machine.createdAt),
      retiredDate: machine.retiredAt ? toPlantDateOnly(machine.retiredAt) : null,
      retiredAt: machine.retiredAt?.toISOString() ?? null,
      spans: own.map((stint) => ({
        arrivalDate: toPlantDateOnly(stint.arrivalAt),
        departureDate: stint.departureAt ? toPlantDateOnly(stint.departureAt) : null,
      })),
      segments: hourSegments(ledger, ledgerStints, gapFlagThresholdHours),
    };
  });
}

const noHours: HourKindTotals = { workHours: 0, travelHours: 0, unaccountedHours: 0, unresolvedHours: 0 };
const hourKinds = Object.keys(noHours) as (keyof HourKindTotals)[];

const dayCounts = (machine: LedgerMachine, window: ReportWindow, today: DateOnlyIso) => {
  const activeDays = activeDaysIn(machine.spans, window, today);
  const fleetDays = fleetDaysIn(machine, window);
  return { activeDays, fleetDays, utilisationPercent: utilisationPercent(activeDays, fleetDays) };
};

/** A Machine row before the final parse brands its timestamp. */
type MachineRow = HourKindTotals & {
  machineId: string;
  code: string;
  categoryId: string;
  retiredAt: string | null;
  activeDays: number;
  fleetDays: number;
  utilisationPercent: number | null;
};

/** Day-weighted totals: the sums of the members' days and hours, never a mean of their percentages. */
function aggregate(rows: readonly MachineRow[]) {
  const activeDays = rows.reduce((sum, row) => sum + row.activeDays, 0);
  const fleetDays = rows.reduce((sum, row) => sum + row.fleetDays, 0);
  const hours = Object.fromEntries(
    hourKinds.map((kind) => [kind, Math.round(rows.reduce((sum, row) => sum + row[kind], 0) * 10) / 10]),
  ) as HourKindTotals;
  const machineCount = rows.length;
  const activeMachineCount = rows.filter((row) => row.activeDays > 0).length;
  return {
    activeDays,
    fleetDays,
    utilisationPercent: utilisationPercent(activeDays, fleetDays),
    machineCount,
    activeMachineCount,
    ...hours,
  };
}

export async function getUtilisationReport({
  db,
  input,
  today = getPlantDateNow(),
}: {
  db: Db;
  input: ReportWindowInput;
  today?: DateOnlyIso;
}): Promise<UtilisationReport> {
  const settings = await getContractingSettings({ db });
  const window = resolveReportWindow(input, today);
  const machines = await loadFleetLedger(db, settings.gapFlagThresholdHours);
  const rows = machines.flatMap((machine): (MachineRow & { category: LedgerMachine['category'] })[] => {
    const counts = dayCounts(machine, window, today);
    if (counts.fleetDays === 0) return [];
    return [
      {
        machineId: machine.id,
        code: machine.code,
        categoryId: machine.categoryId,
        retiredAt: machine.retiredAt,
        category: machine.category,
        ...counts,
        ...(window.days === 0 ? noHours : allocateHours(machine.segments, window)),
      },
    ];
  });
  const categories = [...groupBy(rows, (row) => row.categoryId)].map(([categoryId, members]) => {
    const machinesInCategory = members.map(({ category: _category, ...row }) => row);
    return {
      categoryId,
      ...members[0].category,
      ...aggregate(machinesInCategory),
      machines: machinesInCategory,
    };
  });
  const fleet = aggregate(rows);
  return UtilisationReport.parse({
    window,
    fleet: { ...fleet, fleetLoadPercent: utilisationPercent(fleet.activeMachineCount, fleet.machineCount) },
    categories,
    utilisationTargetPercent: settings.utilisationTargetPercent,
  });
}

export async function getUtilisationTrend({
  db,
  input,
  today = getPlantDateNow(),
}: {
  db: Db;
  input: UtilisationTrendInput;
  today?: DateOnlyIso;
}): Promise<UtilisationTrend> {
  const settings = await getContractingSettings({ db });
  const machines = await loadFleetLedger(db, settings.gapFlagThresholdHours);
  const { subject } = input;
  const members =
    subject.kind === 'fleet'
      ? machines
      : machines.filter((machine) => (subject.kind === 'category' ? machine.categoryId : machine.id) === subject.id);
  const first = members[0];
  if (subject.kind !== 'fleet' && !first)
    throw new ReportError('report.not_found', 'That Category or Machine does not exist.');
  const label = subject.kind === 'fleet' ? 'Fleet' : subject.kind === 'category' ? first?.category.name : first?.code;
  const months = trailingMonthWindows(resolveReportWindow(input.window, today), today).map((window) => {
    const activeDays = members.reduce((sum, machine) => sum + activeDaysIn(machine.spans, window, today), 0);
    const fleetDays = members.reduce((sum, machine) => sum + fleetDaysIn(machine, window), 0);
    return {
      month: window.start.slice(0, 7),
      activeDays,
      fleetDays,
      utilisationPercent: utilisationPercent(activeDays, fleetDays),
    };
  });
  return UtilisationTrend.parse({
    subject,
    label,
    months,
    utilisationTargetPercent: settings.utilisationTargetPercent,
  });
}
