import { type DatabaseTransaction, type Db, jobBuildSpecAssemblies, jobs } from '@pkg/db';
import { UUID } from '@pkg/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';

/**
 * One Optional Assembly the machine carries, and the Job that fitted it.
 *
 * `productAssemblyId` is null once the catalog entry it was fitted from is deleted. The name is the
 * snapshot taken when the work was specified, so it keeps reading true after a catalog rename.
 */
export type AsBuiltAssembly = {
  id: UUID;
  jobId: UUID;
  name: string;
  productAssemblyId: UUID | null;
};

/**
 * A Product Unit's As-Built Spec: the union of its live Jobs' Build Specs, in the order the work
 * happened — the build's Assemblies, then each rework's.
 *
 * This is the single source for what is fitted to a machine. The Unit page shows it, an Allocation
 * Quote seeds its selections from it, and a Rework Job takes its difference against it, so all three
 * must agree by construction rather than because the CFO happens to mirror the Build Spec.
 *
 * Cancelled Jobs are excluded: their spec is a plan, not a record of what was fitted, so counting it
 * would seed the next sale with Assemblies the customer never received — a worse error than omitting
 * part-finished work, which a human can still see on the Unit's Job history.
 */
export async function loadAsBuiltSpec({
  db,
  productUnitId,
}: {
  db: Db | DatabaseTransaction;
  productUnitId: UUID;
}): Promise<AsBuiltAssembly[]> {
  const rows = await db
    .select({
      id: jobBuildSpecAssemblies.id,
      jobId: jobBuildSpecAssemblies.jobId,
      name: jobBuildSpecAssemblies.assemblyName,
      productAssemblyId: jobBuildSpecAssemblies.productAssemblyId,
    })
    .from(jobBuildSpecAssemblies)
    .innerJoin(jobs, eq(jobs.id, jobBuildSpecAssemblies.jobId))
    .where(and(eq(jobs.productUnitId, productUnitId), isNull(jobs.cancelledAt)))
    .orderBy(asc(jobs.createdAt), asc(jobs.id), asc(jobBuildSpecAssemblies.sequence));

  return rows.map((row) => ({
    id: UUID.parse(row.id),
    jobId: UUID.parse(row.jobId),
    name: row.name,
    productAssemblyId: row.productAssemblyId === null ? null : UUID.parse(row.productAssemblyId),
  }));
}
