import { type Db, jobBays, jobDepartmentCrew, jobDepartmentTimings, jobSlots, jobs, productUnits, user } from '@pkg/db';
import { timingWorkingDays, toPlantDateOnly } from '@pkg/domain';
import {
  DateIso,
  type ProductBuildMetrics,
  type ProductBuildMetricsInput,
  ProductBuildMetrics as ProductBuildMetricsSchema,
} from '@pkg/schema';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { createOrgWorkingCalendar, listWorkingCalendarOffDays } from '../jobs/working-calendar-service.js';
import { productUnitBuildJobId } from '../units/product-unit-read-service.js';

/**
 * What this Product's builds actually took in one Department, against what they were scheduled to
 * take. Computed live from Department Timing stamps every read, the same rule Dashboard Metrics
 * follow — there is no reporting table and nothing to keep in step.
 *
 * A Job counts only as its Unit's Build Job: a rework carries its own stamps but says nothing about
 * how long building one of these takes. Job Completion is deliberately not required — the actual is
 * known the moment the department stamps done, weeks before the factory manager closes the Job.
 */
export async function getProductBuildMetrics({
  db,
  includeRanking,
  input,
}: {
  db: Db;
  includeRanking: boolean;
  input: ProductBuildMetricsInput;
}): Promise<ProductBuildMetrics> {
  const offDays = await listWorkingCalendarOffDays(db);
  const workingCalendar = createOrgWorkingCalendar(offDays);

  const rows = await db
    .select({
      completedAt: jobDepartmentTimings.completedAt,
      jobCode: jobs.code,
      jobId: jobs.id,
      productSerialNumber: productUnits.productSerialNumber,
      scheduledWorkingDays: sql<number | null>`(
        select sum(${jobSlots.durationDays})
        from ${jobSlots}
        join ${jobBays} on ${jobBays.id} = ${jobSlots.bayId}
        where ${jobSlots.jobId} = ${jobs.id}
          and ${jobSlots.kind} = 'work'
          and ${jobBays.department} = ${input.department}
      )`,
      startedAt: jobDepartmentTimings.startedAt,
    })
    .from(jobs)
    .innerJoin(productUnits, eq(productUnits.id, jobs.productUnitId))
    .innerJoin(
      jobDepartmentTimings,
      and(eq(jobDepartmentTimings.jobId, jobs.id), eq(jobDepartmentTimings.department, input.department)),
    )
    .where(
      and(
        eq(productUnits.productId, input.productId),
        isNull(jobs.cancelledAt),
        isNotNull(jobDepartmentTimings.completedAt),
        // The Unit's Build Job predicate, read through the one column that owns it.
        sql`${jobs.id} = ${productUnitBuildJobId}`,
      ),
    )
    .orderBy(asc(jobDepartmentTimings.completedAt), asc(jobs.id));

  const crewRows =
    rows.length === 0
      ? []
      : await db
          .select({ jobId: jobDepartmentCrew.jobId, name: user.name, userId: user.id })
          .from(jobDepartmentCrew)
          .innerJoin(user, eq(user.id, jobDepartmentCrew.crewUserId))
          .where(
            and(
              eq(jobDepartmentCrew.department, input.department),
              inArray(
                jobDepartmentCrew.jobId,
                rows.map((row) => row.jobId),
              ),
            ),
          );

  const builds = rows.map((row) => {
    // biome-ignore lint/style/noNonNullAssertion: the query only selects rows with a done-stamp.
    const completedAt = row.completedAt!;

    return {
      actualWorkingDays: timingWorkingDays(
        toPlantDateOnly(row.startedAt),
        toPlantDateOnly(completedAt),
        workingCalendar,
      ),
      completedAt: DateIso.parse(completedAt),
      crewSize: crewRows.filter((crew) => crew.jobId === row.jobId).length,
      jobCode: row.jobCode,
      jobId: row.jobId,
      productSerialNumber: row.productSerialNumber,
      scheduledWorkingDays: row.scheduledWorkingDays === null ? null : Number(row.scheduledWorkingDays),
    };
  });

  return ProductBuildMetricsSchema.parse({
    averageWorkingDays: builds.length === 0 ? null : average(builds.map((build) => build.actualWorkingDays)),
    buildCount: builds.length,
    builds,
    ranking: includeRanking ? rankCrew(builds, crewRows) : null,
  });
}

/**
 * Each crew member carries the whole elapsed time of every build they were on. Dividing it by crew
 * size would read as productivity, which two people on a hard build have not earned less of; the
 * average crew size rides alongside so a reader can see what the number was worked under.
 */
function rankCrew(
  builds: readonly { actualWorkingDays: number; jobId: string }[],
  crewRows: readonly { jobId: string; name: string; userId: string }[],
): ProductBuildMetrics['ranking'] {
  const byUser = new Map<string, { crewSizes: number[]; name: string; workingDays: number[] }>();
  const crewSizeByJobId = new Map<string, number>();

  for (const crew of crewRows) {
    crewSizeByJobId.set(crew.jobId, (crewSizeByJobId.get(crew.jobId) ?? 0) + 1);
  }

  for (const build of builds) {
    for (const crew of crewRows.filter((row) => row.jobId === build.jobId)) {
      const entry = byUser.get(crew.userId) ?? { crewSizes: [], name: crew.name, workingDays: [] };

      entry.crewSizes.push(crewSizeByJobId.get(build.jobId) ?? 0);
      entry.workingDays.push(build.actualWorkingDays);
      byUser.set(crew.userId, entry);
    }
  }

  return [...byUser.entries()]
    .map(([userId, entry]) => ({
      averageCrewSize: average(entry.crewSizes),
      averageWorkingDays: average(entry.workingDays),
      buildCount: entry.workingDays.length,
      name: entry.name,
      userId,
    }))
    .sort((left, right) => left.averageWorkingDays - right.averageWorkingDays || left.name.localeCompare(right.name));
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
