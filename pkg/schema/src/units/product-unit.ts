import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../common/date.js';
import { createSearchedSortedPagedQueryInput, createSortedPagedQueryResult } from '../common/pagination.js';
import { JobCode, QuoteCode } from '../common/public-code.js';
import { nullableTrimmedText, nullableTrimmedTextInput } from '../common/text.js';
import { UUID } from '../common/uuid.js';
import { JobCompletedOn, ProductSerialNumber, ProductUnitVinNumber } from '../jobs/job.js';
import { ProductModelCode, ProductName } from '../products/product.js';

export type ProductUnitTransferNote = z.infer<typeof ProductUnitTransferNote>;
export const ProductUnitTransferNote = nullableTrimmedText();

export type ProductUnitOwner = z.infer<typeof ProductUnitOwner>;
export const ProductUnitOwner = z.object({
  id: UUID,
  companyName: z.string().trim().min(1),
});

/**
 * One assertion that a Product Unit changed hands. Append-only: a reversal, a resale, and a return to
 * Stock are all further rows. A `null` Customer on either side means we hold the machine, and a `null`
 * actor means the system wrote the row rather than a person.
 */
export type ProductUnitOwnershipTransfer = z.infer<typeof ProductUnitOwnershipTransfer>;
export const ProductUnitOwnershipTransfer = z.object({
  id: UUID,
  fromCustomer: ProductUnitOwner.nullable(),
  toCustomer: ProductUnitOwner.nullable(),
  /** Plant business date the machine actually changed hands. */
  occurredOn: DateOnlyIso,
  sourceQuote: z.object({ id: UUID, code: QuoteCode }).nullable(),
  actor: z.object({ id: AuthId, name: z.string().trim().min(1) }).nullable(),
  note: ProductUnitTransferNote,
  createdAt: DateIso,
});

/** A Job that built or reworked this machine, in the order the work happened. */
export type ProductUnitJob = z.infer<typeof ProductUnitJob>;
export const ProductUnitJob = z.object({
  id: UUID,
  code: JobCode,
  completedOn: JobCompletedOn,
  cancelledAt: DateIso.nullable(),
  createdAt: DateIso,
});

/**
 * A Unit's build state. `on-hand` once its Build Job records a Job Completion, `in-build` before that.
 * Derived from the Job, never stored — the same rule the Job List reads `completedOn` under.
 */
export type ProductUnitBuildState = z.infer<typeof ProductUnitBuildState>;
export const ProductUnitBuildState = z.enum(['in-build', 'on-hand']);

export type ProductUnitSummary = z.infer<typeof ProductUnitSummary>;
export const ProductUnitSummary = z.object({
  id: UUID,
  productSerialNumber: ProductSerialNumber,
  vinNumber: ProductUnitVinNumber,
  buildState: ProductUnitBuildState,
  /** `null` means Stock: we hold the machine. */
  owner: ProductUnitOwner.nullable(),
  /** Never null: a Unit is built as some Product, and the row cannot exist without one. */
  product: z.object({ id: UUID, modelCode: ProductModelCode, name: ProductName }),
  createdAt: DateIso,
});

export type ProductUnitDetail = z.infer<typeof ProductUnitDetail>;
export const ProductUnitDetail = ProductUnitSummary.extend({
  /** The Optional Assemblies fitted to the machine, across every Job that has worked on it. */
  asBuiltSpec: z.array(z.object({ id: UUID, jobId: UUID, name: z.string().trim().min(1) })),
  jobs: z.array(ProductUnitJob),
  ownershipHistory: z.array(ProductUnitOwnershipTransfer),
});

/** Filter choices drawn from the Units that exist, so no filter can select an empty result. */
export type ProductUnitFilterOptions = z.infer<typeof ProductUnitFilterOptions>;
export const ProductUnitFilterOptions = z.object({
  owners: z.array(ProductUnitOwner),
  products: z.array(z.object({ id: UUID, modelCode: ProductModelCode, name: ProductName })),
});

export type ProductUnitSortBy = z.infer<typeof ProductUnitSortBy>;
export const ProductUnitSortBy = z.enum(['createdAt', 'id', 'productSerialNumber']);

export type ProductUnitColumnFilters = z.infer<typeof ProductUnitColumnFilters>;
export const ProductUnitColumnFilters = z
  .object({
    buildState: ProductUnitBuildState.optional(),
    /** The Customer that holds the machine now, or `stock` for the ones we hold. */
    owner: z.union([UUID, z.literal('stock')]).optional(),
    productId: UUID.optional(),
  })
  .default({});

export type ProductUnitListInput = z.infer<typeof ProductUnitListInput>;
export const ProductUnitListInput = createSearchedSortedPagedQueryInput({
  defaultSortDirection: 'desc',
  shape: { columnFilters: ProductUnitColumnFilters },
  sortBy: ProductUnitSortBy.default('createdAt'),
});

export type ProductUnitListResult = z.infer<typeof ProductUnitListResult>;
export const ProductUnitListResult = createSortedPagedQueryResult(ProductUnitSummary, ProductUnitSortBy);

/**
 * The machine's identity as a person may edit it. Only the VIN: the serial is minted with the Unit and
 * the Product it was built as is a fact about the build, so neither is editable.
 */
export type ProductUnitUpdateInput = z.infer<typeof ProductUnitUpdateInput>;
export const ProductUnitUpdateInput = z
  .object({
    id: UUID,
    vinNumber: nullableTrimmedTextInput(),
  })
  .strict();

export type ProductUnitUpdateResult = z.infer<typeof ProductUnitUpdateResult>;
export const ProductUnitUpdateResult = z.object({
  unit: ProductUnitDetail,
});

/**
 * A move recorded by hand: a resale between Customers, or a machine handed back to us. It carries no
 * Quote, price, or salesperson, because we were not part of the transaction — the origin is read off
 * the Unit's current Owner rather than typed, so the log can only ever be a chain.
 */
export type ProductUnitTransferInput = z.infer<typeof ProductUnitTransferInput>;
export const ProductUnitTransferInput = z
  .object({
    id: UUID,
    /** The Customer taking the machine, or `null` to return it to Stock. */
    toCustomerId: UUID.nullable(),
    /** Plant business date the machine actually changed hands, which is rarely today. */
    occurredOn: DateOnlyIso,
    note: nullableTrimmedTextInput(),
  })
  .strict();

export type ProductUnitTransferResult = z.infer<typeof ProductUnitTransferResult>;
export const ProductUnitTransferResult = z.object({
  unit: ProductUnitDetail,
});
