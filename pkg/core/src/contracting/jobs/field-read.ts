import { type Db, user } from '@pkg/db';
import { contractingJobs } from '@pkg/db/contracting';
import { assignmentState, formatJobNumber, type JobActor } from '@pkg/domain/contracting';
import { FieldDriver, FieldJob, finishedJobStatuses, openJobStatuses } from '@pkg/schema/contracting';
import { and, asc, eq, gte, inArray, or, type SQL } from 'drizzle-orm';
import { readingToWire } from '../readings/reading-wire.js';
import { type LoadedStint, loadStints, selectJobs, stintNames } from './job-load.js';
import { fieldReaderFor, ownedBy } from './job-readers.js';

const loadHeaders = (db: Db, where: SQL | undefined) => selectJobs(db).where(where).orderBy(asc(contractingJobs.code));

function toFieldJob(header: Awaited<ReturnType<typeof loadHeaders>>[number], stints: readonly LoadedStint[]) {
  return FieldJob.parse({
    ...header.job,
    jobNumber: formatJobNumber(header.job.code),
    customerName: header.customerName,
    farmName: header.farmName,
    workTypeName: header.workTypeName,
    stints: stints.map((loaded) => ({
      ...loaded.stint,
      ...stintNames(loaded),
      state: assignmentState(loaded.stint),
      arrival: loaded.arrival ? readingToWire(loaded.arrival) : null,
      departure: loaded.departure ? readingToWire(loaded.departure) : null,
      createdAt: loaded.stint.createdAt.toISOString(),
    })),
  });
}

const FINISHED_WINDOW_DAYS = 90;

export async function listFieldJobs({
  db,
  actor,
  includeFinished = false,
  now = new Date(),
}: {
  db: Db;
  actor: JobActor;
  includeFinished?: boolean;
  now?: Date;
}) {
  const reader = fieldReaderFor(actor);
  const open = inArray(contractingJobs.status, [...openJobStatuses]);
  const recentlyFinished = and(
    inArray(contractingJobs.status, [...finishedJobStatuses]),
    gte(contractingJobs.completedAt, new Date(now.getTime() - FINISHED_WINDOW_DAYS * 24 * 60 * 60 * 1000)),
  );
  const headers = await loadHeaders(
    db,
    reader.mode === 'own' ? and(open, ownedBy(reader)) : includeFinished ? or(open, recentlyFinished) : open,
  );
  const stintsByJob = new Map<string, LoadedStint[]>();
  for (const loaded of await loadStints(
    db,
    headers.map((header) => header.job.id),
  )) {
    const stints = stintsByJob.get(loaded.stint.jobId) ?? [];
    stints.push(loaded);
    stintsByJob.set(loaded.stint.jobId, stints);
  }
  return headers.map((header) => toFieldJob(header, stintsByJob.get(header.job.id) ?? []));
}

export async function listFieldDrivers({ db }: { db: Db }) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.contractingRole, 'driver'), eq(user.isDevice, false)))
    .orderBy(asc(user.name))
    .then((rows) => rows.map((row) => FieldDriver.parse(row)));
}
