import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingHourReadings, contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import type { BreakdownSubjectRef } from '@pkg/schema/contracting';
import { and, eq } from 'drizzle-orm';
import { stintOnSite } from '../jobs/job-sql.js';

export type OnSiteAssignment = {
  stintId: string;
  jobId: string;
  jobCode: number;
  foremanUserId: string | null;
  arrivedAt: Date;
};

/** The stint column that names a subject: a Machine directly, an Implement through the stint it is attached to. */
export const stintSubjectColumn = (kind: BreakdownSubjectRef['kind']) =>
  kind === 'machine' ? contractingMachineAssignments.machineId : contractingMachineAssignments.implementId;

/** Where this Machine or Implement is right now: its on-site Assignment and that Job, or null in the yard. */
export async function onSiteAssignment({
  db,
  subject,
}: {
  db: Db | DatabaseTransaction;
  subject: BreakdownSubjectRef;
}): Promise<OnSiteAssignment | null> {
  const [row] = await db
    .select({
      stintId: contractingMachineAssignments.id,
      jobId: contractingJobs.id,
      jobCode: contractingJobs.code,
      foremanUserId: contractingJobs.foremanUserId,
      arrivedAt: contractingHourReadings.capturedAt,
    })
    .from(contractingMachineAssignments)
    .innerJoin(contractingJobs, eq(contractingJobs.id, contractingMachineAssignments.jobId))
    .innerJoin(contractingHourReadings, eq(contractingHourReadings.id, contractingMachineAssignments.arrivalReadingId))
    .where(and(eq(stintSubjectColumn(subject.kind), subject.id), stintOnSite(contractingMachineAssignments)))
    .limit(1);
  return row ?? null;
}
