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
  hourSegments,
  type LedgerReading,
  type LedgerStint,
  resolveReportWindow,
  round1,
  trailingMonthWindows,
  utilisationPercent,
} from '@pkg/domain/contracting';
import type { DateOnlyIso } from '@pkg/schema';
import {
  type CategoryUtilisation,
  type MachineUtilisation,
  type ReportWindow,
  type ReportWindowInput,
  UtilisationReport,
  UtilisationTrend,
  type UtilisationTrendInput,
  type UtilisationTrendSubject,
} from '@pkg/schema/contracting';
import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getContractingSettings } from '../settings/settings-service.js';
import { ReportError } from './report-errors.js';

/** One Machine with its fleet span, its stints as plant dates, and its whole reading ledger in `sequence` order. */
type FleetMachine = {
  id: string;
  code: string;
  categoryId: string;
  category: Pick<CategoryUtilisation, 'name' | 'icon' | 'colour'>;
  createdDate: DateOnlyIso;
  retiredDate: DateOnlyIso | null;
  retiredAt: string | null;
  spans: ActiveSpan[];
  readings: LedgerReading[];
  stints: LedgerStint[];
};

const arrival = alias(contractingHourReadings, 'report_arrival');
const departure = alias(contractingHourReadings, 'report_departure');

/**
 * Three queries for the whole fleet, retired Machines included, and nothing per Machine. The ledger walk needs the
 * readings either side of a window boundary, so the whole ledger is read; at ~80 Machines and a few readings a stint
 * that is small. If it ever grows, bound the reading load to the trend's twelve months plus one reading either side.
 */
async function loadFleet(db: Db): Promise<FleetMachine[]> {
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
        arrivalReadingId: arrival.id,
        departureReadingId: contractingMachineAssignments.departureReadingId,
        gapResolvedAt: contractingMachineAssignments.gapResolvedAt,
        gapTravelHours: contractingMachineAssignments.gapTravelHours,
        gapUnaccountedHours: contractingMachineAssignments.gapUnaccountedHours,
        arrivalAt: arrival.capturedAt,
        departureAt: departure.capturedAt,
      })
      .from(contractingMachineAssignments)
      .innerJoin(arrival, eq(arrival.id, contractingMachineAssignments.arrivalReadingId))
      .leftJoin(departure, eq(departure.id, contractingMachineAssignments.departureReadingId)),
  ]);
  const readingsByMachine = groupBy(readings, (reading) => reading.machineId);
  const stintsByMachine = groupBy(stints, (stint) => stint.machineId);
  return machines.map((machine) => {
    const own = stintsByMachine.get(machine.id) ?? [];
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
      readings: (readingsByMachine.get(machine.id) ?? []).map((reading) => ({
        ...reading,
        capturedAt: reading.capturedAt.toISOString(),
      })),
      stints: own.map((stint) => ({
        arrivalReadingId: stint.arrivalReadingId,
        departureReadingId: stint.departureReadingId,
        gap:
          stint.gapResolvedAt === null
            ? null
            : { travelHours: stint.gapTravelHours ?? 0, unaccountedHours: stint.gapUnaccountedHours ?? 0 },
      })),
    };
  });
}

/** A Machine row before the final parse brands its timestamp. */
type MachineRow = Omit<MachineUtilisation, 'retiredAt'> & { retiredAt: string | null };

/** The Machine's day counts and hours by kind for the window; null when it was not in the fleet during it. */
function machineRow(
  machine: FleetMachine,
  window: ReportWindow,
  today: DateOnlyIso,
  gapFlagThresholdHours: number,
): MachineRow | null {
  const fleetDays = fleetDaysIn(machine, window);
  if (fleetDays === 0) return null;
  const activeDays = activeDaysIn(machine.spans, window, today, machine);
  return {
    machineId: machine.id,
    code: machine.code,
    categoryId: machine.categoryId,
    retiredAt: machine.retiredAt,
    activeDays,
    fleetDays,
    utilisationPercent: utilisationPercent(activeDays, fleetDays),
    ...allocateHours(hourSegments(machine.readings, machine.stints, gapFlagThresholdHours), window),
  };
}

/** Day-weighted totals: the sums of the members' days and hours, never a mean of their percentages. */
function aggregate(rows: readonly MachineRow[]) {
  const sum = (of: (row: MachineRow) => number) => rows.reduce((total, row) => total + of(row), 0);
  const activeDays = sum((row) => row.activeDays);
  const fleetDays = sum((row) => row.fleetDays);
  return {
    activeDays,
    fleetDays,
    utilisationPercent: utilisationPercent(activeDays, fleetDays),
    machineCount: rows.length,
    activeMachineCount: rows.filter((row) => row.activeDays > 0).length,
    workHours: round1(sum((row) => row.workHours)),
    travelHours: round1(sum((row) => row.travelHours)),
    unaccountedHours: round1(sum((row) => row.unaccountedHours)),
    unresolvedHours: round1(sum((row) => row.unresolvedHours)),
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
  const [settings, fleet] = await Promise.all([getContractingSettings({ db }), loadFleet(db)]);
  const window = resolveReportWindow(input, today);
  // Machines arrive ordered by Category name then code, so the Categories and their rows keep that order.
  const categories = [...groupBy(fleet, (machine) => machine.categoryId)].flatMap(([categoryId, members]) => {
    const machines = members.flatMap(
      (machine) => machineRow(machine, window, today, settings.gapFlagThresholdHours) ?? [],
    );
    if (machines.length === 0) return [];
    return [{ categoryId, ...members[0].category, ...aggregate(machines), machines }];
  });
  const totals = aggregate(categories.flatMap((category) => category.machines));
  return UtilisationReport.parse({
    window,
    fleet: { ...totals, fleetLoadPercent: utilisationPercent(totals.activeMachineCount, totals.machineCount) },
    categories,
    utilisationTargetPercent: settings.utilisationTargetPercent,
  });
}

function trendLabel(subject: UtilisationTrendSubject, members: readonly FleetMachine[]): string {
  if (subject.kind === 'fleet') return 'Fleet';
  const [first] = members;
  if (!first) throw new ReportError('report.not_found', 'That Category or Machine does not exist.');
  return subject.kind === 'category' ? first.category.name : first.code;
}

/** Day counts only: the trend never walks the ledger, so a subject click costs the fleet read and nothing more. */
export async function getUtilisationTrend({
  db,
  input,
  today = getPlantDateNow(),
}: {
  db: Db;
  input: UtilisationTrendInput;
  today?: DateOnlyIso;
}): Promise<UtilisationTrend> {
  const [settings, fleet] = await Promise.all([getContractingSettings({ db }), loadFleet(db)]);
  const { subject } = input;
  const members =
    subject.kind === 'fleet'
      ? fleet
      : fleet.filter((machine) => (subject.kind === 'category' ? machine.categoryId : machine.id) === subject.id);
  const label = trendLabel(subject, members);
  const months = trailingMonthWindows(resolveReportWindow(input.window, today), today).map((window) => {
    const activeDays = members.reduce((sum, machine) => sum + activeDaysIn(machine.spans, window, today, machine), 0);
    const fleetDays = members.reduce((sum, machine) => sum + fleetDaysIn(machine, window), 0);
    return {
      month: window.start,
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
