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
  allocateHours,
  dayCounts,
  hourSegments,
  type LedgerReading,
  type LedgerStint,
  resolveReportWindow,
  round1,
  sumDayCounts,
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
import { asc, eq, isNotNull, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { oldestFirst } from '../readings/reading-sql.js';
import { getContractingSettings } from '../settings/settings-service.js';
import { reportNotFound } from './report-errors.js';

/** One Machine with its Category, its fleet span and its stints as plant dates: what the day counts read. */
type FleetMachine = {
  id: string;
  code: string;
  categoryId: string;
  category: Pick<CategoryUtilisation, 'name' | 'icon' | 'colour'>;
  createdDate: DateOnlyIso;
  retiredDate: DateOnlyIso | null;
  spans: ActiveSpan[];
};

/** One Machine's whole reading ledger in Read At order and the stints that phase it: what the hours read. */
type Ledger = { readings: LedgerReading[]; stints: LedgerStint[] };

const EMPTY_LEDGER: Ledger = { readings: [], stints: [] };

const arrival = alias(contractingHourReadings, 'report_arrival');
const departure = alias(contractingHourReadings, 'report_departure');

/**
 * Two queries for the fleet `where` keeps, retired Machines included, and nothing per Machine: the Machines with
 * their Categories, and their stints as the plant dates of the arrival and departure readings.
 */
async function loadFleetSpans(db: Db, where?: SQL): Promise<FleetMachine[]> {
  const [machines, stints] = await Promise.all([
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
      .where(where)
      .orderBy(asc(contractingCategories.name), asc(contractingMachines.code)),
    db
      .select({
        machineId: contractingMachineAssignments.machineId,
        arrivalAt: arrival.capturedAt,
        departureAt: departure.capturedAt,
      })
      .from(contractingMachineAssignments)
      .innerJoin(contractingMachines, eq(contractingMachines.id, contractingMachineAssignments.machineId))
      .innerJoin(arrival, eq(arrival.id, contractingMachineAssignments.arrivalReadingId))
      .leftJoin(departure, eq(departure.id, contractingMachineAssignments.departureReadingId))
      .where(where),
  ]);
  const stintsByMachine = groupBy(stints, (stint) => stint.machineId);
  return machines.map((machine) => ({
    id: machine.id,
    code: machine.code,
    categoryId: machine.categoryId,
    category: { name: machine.name, icon: machine.icon, colour: machine.colour },
    createdDate: toPlantDateOnly(machine.createdAt),
    retiredDate: machine.retiredAt ? toPlantDateOnly(machine.retiredAt) : null,
    spans: (stintsByMachine.get(machine.id) ?? []).map((stint) => ({
      arrivalDate: toPlantDateOnly(stint.arrivalAt),
      departureDate: stint.departureAt ? toPlantDateOnly(stint.departureAt) : null,
    })),
  }));
}

/**
 * Two queries for the whole fleet's ledger, grouped by Machine. The ledger walk needs the readings either side of a
 * window boundary, so the whole ledger is read; at ~80 Machines and a few readings a stint that is small. If it ever
 * grows, bound the reading load to the trend's twelve months plus one reading either side.
 */
async function loadLedger(db: Db): Promise<Map<string, Ledger>> {
  const [readings, stints] = await Promise.all([
    db
      .select({
        id: contractingHourReadings.id,
        machineId: contractingHourReadings.machineId,
        role: contractingHourReadings.role,
        value: contractingHourReadings.value,
        capturedAt: contractingHourReadings.capturedAt,
      })
      .from(contractingHourReadings)
      .orderBy(asc(contractingHourReadings.machineId), ...oldestFirst),
    db
      .select({
        machineId: contractingMachineAssignments.machineId,
        arrivalReadingId: contractingMachineAssignments.arrivalReadingId,
        departureReadingId: contractingMachineAssignments.departureReadingId,
        gapResolvedAt: contractingMachineAssignments.gapResolvedAt,
        gapTravelHours: contractingMachineAssignments.gapTravelHours,
        gapUnaccountedHours: contractingMachineAssignments.gapUnaccountedHours,
      })
      .from(contractingMachineAssignments)
      // A planned stint has no arrival yet, so it phases nothing.
      .where(isNotNull(contractingMachineAssignments.arrivalReadingId)),
  ]);
  const ledgers = new Map<string, Ledger>();
  const ledgerOf = (machineId: string): Ledger => {
    const ledger = ledgers.get(machineId) ?? { readings: [], stints: [] };
    ledgers.set(machineId, ledger);
    return ledger;
  };
  for (const { machineId, capturedAt, ...reading } of readings)
    ledgerOf(machineId).readings.push({ ...reading, capturedAt: capturedAt.toISOString() });
  for (const stint of stints) {
    if (stint.arrivalReadingId === null) continue;
    ledgerOf(stint.machineId).stints.push({
      arrivalReadingId: stint.arrivalReadingId,
      departureReadingId: stint.departureReadingId,
      gap:
        stint.gapResolvedAt === null
          ? null
          : { travelHours: stint.gapTravelHours ?? 0, unaccountedHours: stint.gapUnaccountedHours ?? 0 },
    });
  }
  return ledgers;
}

/** The Machine's day counts and hours by kind for the window; null when it was not in the fleet during it. */
function machineRow(
  machine: FleetMachine,
  ledger: Ledger,
  window: ReportWindow,
  today: DateOnlyIso,
  gapFlagThresholdHours: number,
): MachineUtilisation | null {
  const days = dayCounts(machine, window, today);
  if (days.fleetDays === 0) return null;
  return {
    machineId: machine.id,
    code: machine.code,
    categoryId: machine.categoryId,
    retiredDate: machine.retiredDate,
    ...days,
    ...allocateHours(hourSegments(ledger.readings, ledger.stints, gapFlagThresholdHours), window),
  };
}

/** Day-weighted totals: the sums of the members' days and hours, never a mean of their percentages. */
function aggregate(rows: readonly MachineUtilisation[]) {
  const sum = (of: (row: MachineUtilisation) => number) => rows.reduce((total, row) => total + of(row), 0);
  return {
    ...sumDayCounts(rows),
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
  const [settings, fleet, ledgers] = await Promise.all([
    getContractingSettings({ db }),
    loadFleetSpans(db),
    loadLedger(db),
  ]);
  const window = resolveReportWindow(input, today);
  // Machines arrive ordered by Category name then code, so the Categories and their rows keep that order.
  const categories = [...groupBy(fleet, (machine) => machine.categoryId)].flatMap(([categoryId, members]) => {
    const machines = members.flatMap(
      (machine) =>
        machineRow(machine, ledgers.get(machine.id) ?? EMPTY_LEDGER, window, today, settings.gapFlagThresholdHours) ??
        [],
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

/** The subject's own name, so a Category with no Machines yet still names its trend. */
async function trendLabel(db: Db, subject: UtilisationTrendSubject): Promise<string> {
  if (subject.kind === 'fleet') return 'Fleet';
  const [row] =
    subject.kind === 'category'
      ? await db
          .select({ label: contractingCategories.name })
          .from(contractingCategories)
          .where(eq(contractingCategories.id, subject.id))
          .limit(1)
      : await db
          .select({ label: contractingMachines.code })
          .from(contractingMachines)
          .where(eq(contractingMachines.id, subject.id))
          .limit(1);
  if (!row) throw reportNotFound('That Category or Machine does not exist.');
  return row.label;
}

/** The Machines a trend subject covers, as a filter on the fleet read. */
function trendMembers(subject: UtilisationTrendSubject): SQL | undefined {
  switch (subject.kind) {
    case 'fleet':
      return undefined;
    case 'category':
      return eq(contractingMachines.categoryId, subject.id);
    case 'machine':
      return eq(contractingMachines.id, subject.id);
  }
}

/** Day counts only: the trend never walks the ledger, so a subject click costs the fleet span read and nothing more. */
export async function getUtilisationTrend({
  db,
  input,
  today = getPlantDateNow(),
}: {
  db: Db;
  input: UtilisationTrendInput;
  today?: DateOnlyIso;
}): Promise<UtilisationTrend> {
  const { subject } = input;
  const [settings, members, label] = await Promise.all([
    getContractingSettings({ db }),
    loadFleetSpans(db, trendMembers(subject)),
    trendLabel(db, subject),
  ]);
  const months = trailingMonthWindows(resolveReportWindow(input.window, today), today).map((window) => ({
    month: window.start,
    ...sumDayCounts(members.map((machine) => dayCounts(machine, window, today))),
  }));
  return UtilisationTrend.parse({
    subject,
    label,
    months,
    utilisationTargetPercent: settings.utilisationTargetPercent,
  });
}
