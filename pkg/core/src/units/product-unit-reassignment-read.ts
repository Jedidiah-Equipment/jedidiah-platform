import {
  customers,
  type Db,
  jobs,
  productUnitOwnershipTransfers,
  productUnits,
  quoteSelectedAssemblies,
  quotes,
} from '@pkg/db';
import { resolveNewestOwnershipTransfer } from '@pkg/domain';
import {
  ProductUnitReassignCandidate,
  ProductUnitReassignPreview,
  type ProductUnitReassignSpecDiff,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { QuoteNotFoundError } from '../quotes/quote-errors.js';
import { loadAsBuiltSpec } from './product-unit-as-built.js';
import { ProductUnitNotFoundError } from './product-unit-errors.js';
import { assertQuoteCanReceive, isReworkJob } from './product-unit-reassignment.js';

type ReceivingQuoteFacts = {
  id: string;
  productId: string;
};

/**
 * The machines a Quote may be handed, as the picker offers them: the same Product, and either Stock or
 * owned through a deal nobody has invoiced yet. The Unit this Quote is already building is left out —
 * it is the one machine reassignment has nothing to say about.
 *
 * Read-only and unlocked. The write path re-derives every one of these rules under its locks, so a row
 * offered here is a candidate rather than a promise.
 */
export async function listReassignCandidates({
  db,
  quoteId,
}: {
  db: Db;
  quoteId: UUID;
}): Promise<ProductUnitReassignCandidate[]> {
  const quote = await loadReceivingQuote(db, quoteId);
  const currentUnitId = await loadQuoteBuildUnitId(db, quote.id);
  const facts = await loadCandidateFacts(db, quote.productId);

  return facts
    .filter((candidate) => candidate.id !== currentUnitId && candidate.eligible)
    .map((candidate) => candidate.candidate);
}

/**
 * What the confirm step reads: the machine coming in, the one going back to Stock, and how the deal's
 * own selections differ from what the incoming machine actually carries. The diff never blocks — a real
 * difference is a quote amendment, which is a person's decision made out of band.
 */
export async function previewReassignment({
  db,
  productUnitId,
  quoteId,
}: {
  db: Db;
  productUnitId: UUID;
  quoteId: UUID;
}): Promise<ProductUnitReassignPreview> {
  const quote = await loadReceivingQuote(db, quoteId);
  const currentUnitId = await loadQuoteBuildUnitId(db, quote.id);
  const facts = await loadCandidateFacts(db, quote.productId, { includeUnitId: productUnitId });
  const incoming = facts.find((candidate) => candidate.id === productUnitId);

  if (!incoming) {
    throw new ProductUnitNotFoundError(productUnitId);
  }

  const displaced = currentUnitId
    ? (facts.find((candidate) => candidate.id === currentUnitId)?.candidate ?? null)
    : null;

  return ProductUnitReassignPreview.parse({
    displaced,
    incoming: incoming.candidate,
    specDiff: await loadSpecDiff({ db, productUnitId, quoteId: quote.id }),
  });
}

async function loadReceivingQuote(db: Db, quoteId: UUID): Promise<ReceivingQuoteFacts> {
  const [quote] = await db
    .select({
      id: quotes.id,
      invoiceNumber: quotes.invoiceNumber,
      kind: quotes.kind,
      productId: quotes.productId,
      productUnitId: quotes.productUnitId,
      status: quotes.status,
    })
    .from(quotes)
    .where(eq(quotes.id, quoteId));

  if (!quote) {
    throw new QuoteNotFoundError(quoteId);
  }

  assertQuoteCanReceive(quote);

  return { id: quote.id, productId: quote.productId };
}

/** The machine the receiving Quote is building today, which reassignment would displace. */
async function loadQuoteBuildUnitId(db: Db, quoteId: string): Promise<string | null> {
  const [job] = await db
    .select({ productUnitId: jobs.productUnitId })
    .from(jobs)
    .where(and(eq(jobs.quoteId, quoteId), isNull(jobs.cancelledAt)));

  return job?.productUnitId ?? null;
}

type CandidateFacts = {
  candidate: ProductUnitReassignCandidate;
  eligible: boolean;
  id: string;
};

/**
 * Every Unit built as this Product, with the facts the picker shows and the verdict on whether it may
 * move. `includeUnitId` keeps one named Unit in the result even when it is ineligible, so the preview
 * can still describe the machine the Quote is currently building.
 */
async function loadCandidateFacts(
  db: Db,
  productId: string,
  options: { includeUnitId?: string } = {},
): Promise<CandidateFacts[]> {
  const units = await db
    .select({
      id: productUnits.id,
      productSerialNumber: productUnits.productSerialNumber,
      vinNumber: productUnits.vinNumber,
    })
    .from(productUnits)
    .where(eq(productUnits.productId, productId));
  const unitIds = units.map((unit) => unit.id);

  if (unitIds.length === 0) {
    return [];
  }

  const [transferRows, jobRows] = await Promise.all([
    db
      .select({
        createdAt: productUnitOwnershipTransfers.createdAt,
        id: productUnitOwnershipTransfers.id,
        occurredOn: productUnitOwnershipTransfers.occurredOn,
        productUnitId: productUnitOwnershipTransfers.productUnitId,
        sourceQuoteId: productUnitOwnershipTransfers.sourceQuoteId,
        toCustomerId: productUnitOwnershipTransfers.toCustomerId,
      })
      .from(productUnitOwnershipTransfers)
      .where(inArray(productUnitOwnershipTransfers.productUnitId, unitIds)),
    db
      .select({
        code: jobs.code,
        completedOn: jobs.completedOn,
        productUnitId: jobs.productUnitId,
        quoteId: jobs.quoteId,
        quoteProductUnitId: quotes.productUnitId,
      })
      .from(jobs)
      .leftJoin(quotes, eq(quotes.id, jobs.quoteId))
      .where(and(inArray(jobs.productUnitId, unitIds), isNull(jobs.cancelledAt)))
      .orderBy(asc(jobs.createdAt), asc(jobs.id)),
  ]);

  const transfersByUnit = groupBy(transferRows, (row) => row.productUnitId);
  const jobsByUnit = groupBy(jobRows, (row) => row.productUnitId ?? '');
  const newestByUnit = new Map(
    [...transfersByUnit].map(([unitId, rows]) => [unitId, resolveNewestOwnershipTransfer(rows)]),
  );
  const sellingQuotes = await loadSellingQuotes(
    db,
    [...newestByUnit.values()].flatMap((transfer) => (transfer?.sourceQuoteId ? [transfer.sourceQuoteId] : [])),
  );
  const owners = await loadOwnerNames(
    db,
    [...newestByUnit.values()].flatMap((transfer) => (transfer?.toCustomerId ? [transfer.toCustomerId] : [])),
  );

  return units.map((unit) => {
    const newest = newestByUnit.get(unit.id) ?? null;
    const ownerId = newest?.toCustomerId ?? null;
    const unitJobs = jobsByUnit.get(unit.id) ?? [];
    const hasLiveRework = unitJobs.some(isReworkJob);
    // Display always names the build, even on a machine under rework; eligibility is stricter.
    const buildJob = unitJobs.find((job) => !isReworkJob(job)) ?? null;
    const sellingQuote = newest?.sourceQuoteId ? sellingQuotes.get(newest.sourceQuoteId) : undefined;
    const ownershipAllowsMove = ownerId === null || (sellingQuote !== undefined && sellingQuote.invoiceNumber === null);
    const eligible = ownershipAllowsMove && !hasLiveRework && buildJob !== null;

    return {
      candidate: ProductUnitReassignCandidate.parse({
        id: unit.id,
        buildJobCode: buildJob?.code ?? null,
        buildState: buildJob?.completedOn ? 'on-hand' : 'in-build',
        owner: ownerId ? (owners.get(ownerId) ?? null) : null,
        productSerialNumber: unit.productSerialNumber,
        vinNumber: unit.vinNumber,
      }),
      eligible: eligible || unit.id === options.includeUnitId,
      id: unit.id,
    };
  });
}

async function loadSellingQuotes(
  db: Db,
  quoteIds: readonly string[],
): Promise<Map<string, { invoiceNumber: string | null }>> {
  const ids = [...new Set(quoteIds)];

  if (ids.length === 0) return new Map();

  const rows = await db
    .select({ id: quotes.id, invoiceNumber: quotes.invoiceNumber })
    .from(quotes)
    .where(inArray(quotes.id, ids));

  return new Map(rows.map((row) => [row.id, { invoiceNumber: row.invoiceNumber }]));
}

async function loadOwnerNames(
  db: Db,
  customerIds: readonly string[],
): Promise<Map<string, { companyName: string; id: string }>> {
  const ids = [...new Set(customerIds)];

  if (ids.length === 0) return new Map();

  const rows = await db
    .select({ companyName: customers.companyName, id: customers.id })
    .from(customers)
    .where(inArray(customers.id, ids));

  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * What this deal sold against what the machine carries. Matched on the catalog Assembly where both
 * sides still name one, and on the snapshotted name otherwise — a Quote line and a Build Spec line
 * whose catalog entry has since been deleted can still only be compared by what they were called.
 */
async function loadSpecDiff({
  db,
  productUnitId,
  quoteId,
}: {
  db: Db;
  productUnitId: UUID;
  quoteId: string;
}): Promise<ProductUnitReassignSpecDiff> {
  const [asBuilt, selections] = await Promise.all([
    loadAsBuiltSpec({ db, productUnitId }),
    db
      .select({
        productAssemblyId: quoteSelectedAssemblies.productAssemblyId,
        quotedName: quoteSelectedAssemblies.quotedName,
      })
      .from(quoteSelectedAssemblies)
      .where(eq(quoteSelectedAssemblies.quoteId, quoteId)),
  ]);

  const fittedKeys = new Set(asBuilt.map((assembly) => assemblyKey(assembly.productAssemblyId, assembly.name)));
  const quotedKeys = new Set(
    selections.map((selection) => assemblyKey(selection.productAssemblyId, selection.quotedName)),
  );

  return {
    fittedNotQuoted: dedupe(
      asBuilt
        .filter((assembly) => !quotedKeys.has(assemblyKey(assembly.productAssemblyId, assembly.name)))
        .map((assembly) => assembly.name),
    ),
    quotedNotFitted: dedupe(
      selections
        .filter((selection) => !fittedKeys.has(assemblyKey(selection.productAssemblyId, selection.quotedName)))
        .map((selection) => selection.quotedName),
    ),
  };
}

function assemblyKey(productAssemblyId: string | null, name: string): string {
  return productAssemblyId ? `id:${productAssemblyId}` : `name:${name.trim().toLowerCase()}`;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const group = groups.get(key(row));

    if (group) {
      group.push(row);
    } else {
      groups.set(key(row), [row]);
    }
  }

  return groups;
}
