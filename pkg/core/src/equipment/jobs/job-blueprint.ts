import { type DatabaseTransaction, notRemoved } from '@pkg/db';
import { jobs, products, quoteSelectedAssemblies, quotes } from '@pkg/db/equipment';
import { type BuildSpecAssembly, canStartJobFromQuote, selectReworkBuildSpec } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import {
  isStockBuildCreateInput,
  type JobCreateInput,
  type QuoteKind,
  type QuoteOffering,
} from '@pkg/schema/equipment';
import { and, asc, desc, eq } from 'drizzle-orm';

import { listAssemblies } from '../products/product-assembly-service.js';
import { narrowQuoteOffering } from '../quotes/quote-offering.js';
import { loadAsBuiltSpec } from '../units/product-unit-as-built.js';
import { lockUnitForOwnership } from '../units/product-unit-service.js';
import { JobCreateFromQuoteDeniedError, StockBuildDeniedError } from './job-errors.js';

type QuoteRow = typeof quotes.$inferSelect;

// A Job's inputs resolved once at the input boundary. `kind` alone drives every downstream branch, so
// no write site re-derives whether this work creates a machine, reuses one, or has no machine at all.
export type JobBlueprint =
  | {
      kind: 'product';
      quote: QuoteRow;
      productId: UUID;
      reuseProductUnitId: UUID | null;
      buildSpec: BuildSpecAssembly[];
    }
  | {
      kind: 'stock-build';
      quote: null;
      productId: UUID;
      buildSpec: BuildSpecAssembly[];
    }
  | {
      kind: 'rework';
      quote: QuoteRow;
      productId: UUID;
      productUnitId: UUID;
      buildSpec: BuildSpecAssembly[];
    }
  | { kind: 'custom'; quote: QuoteRow };

/** A Build creates the machine; Rework has product work but must keep the Unit it was quoted against. */
export function createsProductUnit(
  blueprint: JobBlueprint,
): blueprint is Extract<JobBlueprint, { kind: 'product' | 'stock-build' }> {
  return blueprint.kind === 'product' || blueprint.kind === 'stock-build';
}

export function hasProductWork(blueprint: JobBlueprint): blueprint is Exclude<JobBlueprint, { kind: 'custom' }> {
  return blueprint.kind !== 'custom';
}

export async function resolveJobBlueprint({
  input,
  tx,
}: {
  input: JobCreateInput;
  tx: DatabaseTransaction;
}): Promise<JobBlueprint> {
  if (isStockBuildCreateInput(input)) {
    await assertStockBuildProductExists({ productId: input.productId, tx });
    const buildSpec = await resolveStockBuildSpec({
      assemblyIds: input.buildSpecAssemblyIds,
      productId: input.productId,
      tx,
    });

    return {
      kind: 'stock-build',
      quote: null,
      productId: input.productId,
      buildSpec,
    };
  }

  const { hasLiveJob, offering, quote, reuseProductUnitId } = await lockQuoteForJobCreate({
    quoteId: input.quoteId,
    tx,
  });

  if (offering.kind === 'custom') {
    assertQuoteCanStartJob({ hasLiveJob, hasProductUnit: false, kind: 'custom', reworkRequired: false, quote });

    return { kind: 'custom', quote };
  }

  const buildSpec = await loadQuoteBuildSpecSeed({ quoteId: quote.id, tx });

  if (offering.productUnitId) {
    // Whether any Assembly is actually being added decides eligibility, so the Rework Build Spec is
    // resolved before the decision rather than re-refused after it.
    const reworkBuildSpec = await loadReworkBuildSpec({
      productUnitId: offering.productUnitId,
      quoteBuildSpec: buildSpec,
      tx,
    });

    assertQuoteCanStartJob({
      hasLiveJob,
      hasProductUnit: true,
      kind: 'product',
      reworkRequired: reworkBuildSpec.length > 0,
      quote,
    });

    return {
      buildSpec: reworkBuildSpec,
      kind: 'rework',
      productId: offering.productId,
      productUnitId: offering.productUnitId,
      quote,
    };
  }

  assertQuoteCanStartJob({ hasLiveJob, hasProductUnit: false, kind: 'product', reworkRequired: false, quote });

  return { kind: 'product', quote, productId: offering.productId, reuseProductUnitId, buildSpec };
}

/**
 * A removed Product is gone from the picker, so a Stock Build naming one is a stale tab or a hand-made
 * request — never something we should mint a serial and a machine for.
 */
async function assertStockBuildProductExists({
  productId,
  tx,
}: {
  productId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  const [product] = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), notRemoved(products)))
    .limit(1);

  if (!product) {
    throw new StockBuildDeniedError('Product not found.');
  }
}

/**
 * A Stock Build's Build Spec, resolved from the Optional Assemblies the administrator picked. The name
 * is snapshotted here for the same reason a Quote's is: the CFO and the As-Built Spec must keep saying
 * what was fitted after the catalog entry is renamed.
 */
async function resolveStockBuildSpec({
  assemblyIds,
  productId,
  tx,
}: {
  assemblyIds: readonly UUID[];
  productId: UUID;
  tx: DatabaseTransaction;
}): Promise<BuildSpecAssembly[]> {
  const uniqueIds = [...new Set(assemblyIds)];

  if (uniqueIds.length === 0) {
    return [];
  }

  const optionalAssembliesById = new Map(
    (await listAssemblies({ productId, tx }))
      .filter((assembly) => assembly.kind === 'optional')
      .map((assembly) => [assembly.id, assembly] as const),
  );
  const unknown = uniqueIds.filter((assemblyId) => !optionalAssembliesById.has(assemblyId));

  if (unknown.length > 0) {
    throw new StockBuildDeniedError(`Optional assembly does not belong to this Product: ${unknown.join(', ')}.`);
  }

  return uniqueIds.map((assemblyId) => ({
    // Non-null by construction: `unknown` above already rejected every id the catalog does not hold.
    assemblyName: optionalAssembliesById.get(assemblyId)?.name ?? '',
    productAssemblyId: assemblyId,
  }));
}

async function lockQuoteForJobCreate({ quoteId, tx }: { quoteId: UUID; tx: DatabaseTransaction }): Promise<{
  hasLiveJob: boolean;
  offering: QuoteOffering;
  quote: QuoteRow;
  reuseProductUnitId: UUID | null;
}> {
  const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for('update');

  if (!quote) {
    throw new JobCreateFromQuoteDeniedError('Quote not found.');
  }

  const quoteJobs = await tx
    .select({
      cancelledAt: jobs.cancelledAt,
      productUnitId: jobs.productUnitId,
    })
    .from(jobs)
    .where(eq(jobs.quoteId, quoteId))
    .orderBy(desc(jobs.cancelledAt), desc(jobs.id));

  const hasLiveJob = quoteJobs.some((job) => job.cancelledAt === null);
  const reuseCandidateId = quoteJobs.find(
    (job) => job.cancelledAt !== null && job.productUnitId !== null,
  )?.productUnitId;
  let reuseProductUnitId: UUID | null = null;

  if (reuseCandidateId) {
    const ownership = await lockUnitForOwnership(tx, reuseCandidateId);

    // Ownership can move independently of the Locked Quote. Reuse is transfer-free only while the
    // original sale still owns the machine; otherwise replacement creation must mint a newly sold Unit.
    if (ownership?.currentOwnerId === quote.customerId) {
      reuseProductUnitId = ownership.unit.id;
    }
  }

  return {
    hasLiveJob,
    offering: narrowQuoteOffering(quote),
    quote,
    reuseProductUnitId,
  };
}

/** The one place a Quote's own facts decide whether it may source a Job; the rule itself is domain policy. */
function assertQuoteCanStartJob({
  hasLiveJob,
  hasProductUnit,
  kind,
  reworkRequired,
  quote,
}: {
  hasLiveJob: boolean;
  hasProductUnit: boolean;
  kind: QuoteKind;
  reworkRequired: boolean;
  quote: QuoteRow;
}): void {
  const eligibility = canStartJobFromQuote({
    hasLiveJob,
    hasProductUnit,
    kind,
    reworkRequired,
    status: quote.status,
  });

  if (!eligibility.allowed) {
    throw new JobCreateFromQuoteDeniedError(eligibility.reason);
  }
}

/**
 * The Quote's selected Assemblies, as the Build Spec they seed. A copy at one moment, in the Quote's
 * own selection order — never a live read, exactly like the Work Item Rate Card seeding a rate.
 */
async function loadQuoteBuildSpecSeed({
  quoteId,
  tx,
}: {
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<BuildSpecAssembly[]> {
  return tx
    .select({
      assemblyName: quoteSelectedAssemblies.quotedName,
      productAssemblyId: quoteSelectedAssemblies.productAssemblyId,
    })
    .from(quoteSelectedAssemblies)
    .where(eq(quoteSelectedAssemblies.quoteId, quoteId))
    .orderBy(asc(quoteSelectedAssemblies.createdAt), asc(quoteSelectedAssemblies.id));
}

async function loadReworkBuildSpec({
  productUnitId,
  quoteBuildSpec,
  tx,
}: {
  productUnitId: UUID;
  quoteBuildSpec: readonly BuildSpecAssembly[];
  tx: DatabaseTransaction;
}): Promise<BuildSpecAssembly[]> {
  // In-progress Rework counts as As-Built, so later Rework cannot claim the same Optional Assembly.
  const asBuilt = await loadAsBuiltSpec({ db: tx, productUnitId });

  return selectReworkBuildSpec({
    asBuiltAssemblyIds: asBuilt.flatMap((assembly) => (assembly.productAssemblyId ? [assembly.productAssemblyId] : [])),
    quoteBuildSpec,
  });
}
