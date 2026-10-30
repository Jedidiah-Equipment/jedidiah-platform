import type { Db } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import { groupBy } from '@pkg/domain';
import { deriveStintHours, effectiveJobDates } from '@pkg/domain/contracting';
import { DateOnlyIso } from '@pkg/schema';
import { and, eq, isNotNull, type SQL } from 'drizzle-orm';

/**
 * The Jobs `where` keeps, each with its effective dates (stored when set, else from its capture moments, running to
 * today while a Machine is still on site) and its arrived stints' Work and Travel. The dates are the Job's, so every arrived stint on a Job
 * is read, whichever Machines are asked about.
 */
export async function loadDatedJobs(db: Db, today: DateOnlyIso, where?: SQL) {
  const rows = await db
    .select({
      machineId: contractingMachineAssignments.machineId,
      jobId: contractingMachineAssignments.jobId,
      startDate: contractingJobs.startDate,
      endDate: contractingJobs.endDate,
      arrivalHours: contractingMachineAssignments.arrivalHours,
      arrivalAt: contractingMachineAssignments.arrivalAt,
      departureHours: contractingMachineAssignments.departureHours,
      departureAt: contractingMachineAssignments.departureAt,
      travelHours: contractingMachineAssignments.travelHours,
    })
    .from(contractingMachineAssignments)
    .innerJoin(contractingJobs, eq(contractingJobs.id, contractingMachineAssignments.jobId))
    .where(and(isNotNull(contractingMachineAssignments.arrivalAt), where));
  const moment = (at: Date | null) => (at ? { at: at.toISOString() } : null);
  return [...groupBy(rows, (row) => row.jobId).values()].flatMap((stints) => {
    const [first] = stints;
    const dates = effectiveJobDates(
      {
        startDate: DateOnlyIso.nullable().parse(first.startDate),
        endDate: DateOnlyIso.nullable().parse(first.endDate),
      },
      stints.map((stint) => ({ arrival: moment(stint.arrivalAt), departure: moment(stint.departureAt) })),
      today,
    );
    if (!dates) return [];
    return [
      {
        dates,
        stints: stints.map((stint) => ({
          machineId: stint.machineId,
          workHours: deriveStintHours(stint).workHours ?? 0,
          travelHours: stint.travelHours ?? 0,
        })),
      },
    ];
  });
}
