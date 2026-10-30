import type { Db } from '@pkg/db';
import { contractingCategories, contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import { getPlantDateNow, groupBy, toPlantDateOnly } from '@pkg/domain';
import {
  type DatedStintHours,
  dayCounts,
  resolveReportWindow,
  round1,
  stintHourTotals,
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
import { asc, eq, inArray, type SQL } from 'drizzle-orm';
import { getContractingSettings } from '../settings/settings-service.js';
import { loadDatedJobs } from './dated-jobs.js';
import { reportNotFound } from './report-errors.js';

/** One Machine with its Category, its fleet span, and its stints over their Jobs' effective dates. */
type FleetMachine = {
  id: string;
  code: string;
  categoryId: string;
  category: Pick<CategoryUtilisation, 'name' | 'icon' | 'colour'>;
  createdDate: DateOnlyIso;
  retiredDate: DateOnlyIso | null;
  stints: DatedStintHours[];
};

/** The fleet `where` keeps, retired Machines included, each with its stints over their Jobs' effective dates. */
async function loadFleetSpans(db: Db, today: DateOnlyIso, where?: SQL): Promise<FleetMachine[]> {
  const [machines, jobs] = await Promise.all([
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
    // Only the Jobs a member Machine worked on; every arrived stint on those Jobs still dates them.
    loadDatedJobs(
      db,
      today,
      where
        ? inArray(
            contractingMachineAssignments.jobId,
            db
              .select({ jobId: contractingMachineAssignments.jobId })
              .from(contractingMachineAssignments)
              .innerJoin(contractingMachines, eq(contractingMachines.id, contractingMachineAssignments.machineId))
              .where(where),
          )
        : undefined,
    ),
  ]);
  const stintsByMachine = groupBy(
    jobs.flatMap(({ dates, stints }) => stints.map((stint) => ({ ...stint, ...dates }))),
    (stint) => stint.machineId,
  );
  return machines.map((machine) => {
    return {
      id: machine.id,
      code: machine.code,
      categoryId: machine.categoryId,
      category: { name: machine.name, icon: machine.icon, colour: machine.colour },
      createdDate: toPlantDateOnly(machine.createdAt),
      retiredDate: machine.retiredAt ? toPlantDateOnly(machine.retiredAt) : null,
      stints: stintsByMachine.get(machine.id) ?? [],
    };
  });
}

/** The Machine's day counts and hours by kind for the window; null when it was not in the fleet during it. */
function machineRow(machine: FleetMachine, window: ReportWindow): MachineUtilisation | null {
  const days = dayCounts(machine, window);
  if (days.fleetDays === 0) return null;
  return {
    machineId: machine.id,
    code: machine.code,
    categoryId: machine.categoryId,
    retiredDate: machine.retiredDate,
    ...days,
    ...stintHourTotals(machine.stints, window),
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
  const [settings, fleet] = await Promise.all([getContractingSettings({ db }), loadFleetSpans(db, today)]);
  const window = resolveReportWindow(input, today);
  // Machines arrive ordered by Category name then code, so the Categories and their rows keep that order.
  const categories = [...groupBy(fleet, (machine) => machine.categoryId)].flatMap(([categoryId, members]) => {
    const machines = members.flatMap((machine) => machineRow(machine, window) ?? []);
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

/** Day counts only: a subject click costs the fleet span read and nothing more. */
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
    loadFleetSpans(db, today, trendMembers(subject)),
    trendLabel(db, subject),
  ]);
  const months = trailingMonthWindows(resolveReportWindow(input.window, today), today).map((window) => ({
    month: window.start,
    ...sumDayCounts(members.map((machine) => dayCounts(machine, window))),
  }));
  return UtilisationTrend.parse({
    subject,
    label,
    months,
    utilisationTargetPercent: settings.utilisationTargetPercent,
  });
}
