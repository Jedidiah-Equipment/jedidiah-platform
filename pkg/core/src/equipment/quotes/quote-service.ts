import { type DatabaseTransaction, type Db, notRemoved, user } from '@pkg/db';
import { customers, jobs, products, quotes } from '@pkg/db/equipment';
import { getPlantDateNow } from '@pkg/domain';
import {
  assertQuoteEditable,
  isQuoteLocked,
  QUOTE_SALESPERSON_ROLES,
  quoteKindLabels,
  validateDiscount,
} from '@pkg/domain/equipment';
import type { AuditChanges, AuthId, UUID } from '@pkg/schema';
import {
  DEFAULT_PRODUCT_CURRENCY_CODE,
  type QuoteCreateInput,
  type QuoteDetail,
  type QuoteKind,
  type QuotePatchInput,
  type QuoteSelectedAssemblyInput,
  type QuoteStatus,
  type QuoteUpdateInput,
  type QuoteWorkItemInput,
} from '@pkg/schema/equipment';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { diffAuditUpdate, recordAuditCreate, recordAuditUpdate } from '../audit/audit-service.js';
import { customerAuditDescriptor } from '../customers/customer-service.js';
import { cancelJobForQuote } from '../jobs/job-service.js';
import { quoteEverPlacedAUnit, removeProductUnitWithin } from '../units/product-unit-service.js';
import {
  mergeAllocationSeed,
  resolveAllocationQuoteSeed,
  returnQuoteProductUnitToStock,
  transferAllocationQuoteOnAcceptance,
} from './quote-allocation.js';
import { quoteAuditDescriptor } from './quote-audit.js';
import {
  QuoteAlreadyCancelledError,
  QuoteCancelDeniedError,
  QuoteCancelNotAnUpdateError,
  QuoteCustomSelectedAssembliesError,
  QuoteDiscountInvalidError,
  QuoteInvalidReferenceError,
  QuoteLockedError,
  QuoteNotFoundError,
} from './quote-errors.js';
import { narrowQuoteOffering } from './quote-offering.js';
import { getQuote } from './quote-read-service.js';
import {
  listQuoteSelectedAssemblies,
  persistQuoteSelectedAssemblies,
  type QuoteSelectedAssemblyRow,
  type ResolvedQuoteSelectedAssemblies,
  resolveQuoteSelectedAssemblies,
} from './quote-selected-assemblies.js';
import { listQuoteWorkItems, persistQuoteWorkItems, type QuoteWorkItemRow } from './quote-work-items.js';

type QuoteOfferingRow = {
  kind: QuoteKind;
  productId: UUID | null;
  productUnitId: UUID | null;
  quotedBasePrice: number;
  quotedCurrencyCode: string;
  workTitle: string | null;
};

type QuoteCollectionPatchInput = {
  selectedAssemblies?: readonly QuoteSelectedAssemblyInput[] | undefined;
  workItems?: readonly QuoteWorkItemInput[] | undefined;
};

type QuoteCollectionPatch = {
  beforeSelectedAssemblies: QuoteSelectedAssemblyRow[];
  beforeWorkItems: QuoteWorkItemRow[];
  nextWorkItems: readonly QuoteWorkItemInput[];
  resolved: ResolvedQuoteSelectedAssemblies;
  selectedAssembliesChanged: boolean;
  workItemsChanged: boolean;
};

/**
 * The one way a Quote is cancelled, and the only place that decides what the death of a sale does to
 * the records underneath it. Both the header action and the status field come here.
 *
 * What always happens: the Quote is cancelled, and a machine this Quote sold goes back to Stock. What
 * the caller chooses: whether the live Job goes with it, and whether the machine that Job was building
 * — a serial for something nobody ever made — is deleted. Neither is assumed; `removeUnit` in
 * particular defaults off, so the destructive half only ever happens because someone asked.
 *
 * `mayCancelLockedQuote` is the caller's authority for the harder half, not a preference: cancelling an
 * untouched Quote is undoing paperwork, while a Locked one has an accepted sale or a build behind it.
 */
export async function cancelQuote({
  actorUserId,
  cancelJob = true,
  cancellationReason,
  db,
  id,
  mayCancelLockedQuote,
  removeUnit = false,
}: {
  actorUserId: AuthId;
  cancelJob?: boolean;
  cancellationReason: string;
  db: Db;
  id: UUID;
  mayCancelLockedQuote: boolean;
  removeUnit?: boolean;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(quotes).where(eq(quotes.id, id)).for('update');

    if (!before) {
      throw new QuoteNotFoundError(id);
    }

    if (before.status === 'cancelled') {
      throw new QuoteAlreadyCancelledError();
    }

    if (
      !mayCancelLockedQuote &&
      isQuoteLocked({
        hasEverSourcedJob: await quoteHasEverSourcedJob({ quoteId: before.id, tx }),
        hasProductUnit: before.productUnitId !== null,
        kind: before.kind,
        status: before.status,
      })
    ) {
      throw new QuoteCancelDeniedError();
    }

    const [selectedAssemblies, workItems] = await Promise.all([
      listQuoteSelectedAssemblies({ quoteId: before.id, tx }),
      listQuoteWorkItems({ quoteId: before.id, tx }),
    ]);
    const now = new Date();
    const after = {
      ...before,
      cancellationReason,
      status: 'cancelled' as const,
      statusChangedAt: now,
      updatedAt: now,
    };
    const changes = diffAuditUpdate(
      quoteAuditDescriptor,
      { row: before, selectedAssemblies, workItems },
      { row: after, selectedAssemblies, workItems },
    );

    const plantToday = getPlantDateNow();
    const cancelledJob = cancelJob
      ? await cancelJobForQuote({ actorUserId, now, plantToday, quoteId: before.id, tx })
      : null;
    // What becomes of the machine turns on whether a live build is left owing one — not on whether
    // this call is what cancelled it. A Job cancelled earlier, directly, leaves none.
    const liveJobRemains = cancelJob ? false : await quoteHasLiveJob({ quoteId: before.id, tx });

    // An Allocation Quote sold a machine that already existed, so the sale dying hands it back whatever
    // becomes of any Job. A build-to-order Unit belongs to the Job that minted it and returns once no
    // live build is left — otherwise that build would be owing a machine we had taken back.
    //
    // Unless Reassignment already took that Job to another deal, which leaves this Quote holding no Job
    // row at all. The machine is then someone else's live build, and reaching for it here would either
    // strand that build on a Stock-owned machine or refuse this cancellation over an Owner that is
    // no longer any of this deal's business.
    const holdsItsMachine = before.productUnitId !== null || (await quoteHoldsAnyJobRow({ quoteId: before.id, tx }));

    if (holdsItsMachine && (before.productUnitId !== null || !liveJobRemains)) {
      await returnQuoteProductUnitToStock({
        actorUserId,
        customerId: before.customerId,
        occurredOn: plantToday,
        quoteId: before.id,
        tx,
      });
    }

    const [row] = await tx
      .update(quotes)
      .set({ cancellationReason, status: 'cancelled', statusChangedAt: now, updatedAt: now })
      .where(eq(quotes.id, before.id))
      .returning();

    if (!row) {
      throw new QuoteNotFoundError(id);
    }

    if (changes) {
      await recordAuditUpdate({
        db: tx,
        descriptor: quoteAuditDescriptor,
        actorUserId,
        after: { row, selectedAssemblies, workItems },
        changes,
      });
    }

    // Last, so Unit Removal reads a world where the Quote is already cancelled and its Job with it —
    // both of which its own guards insist on. Only ever the machine this Quote's Job minted: an
    // Allocation Quote's Unit existed before the sale and outlives it.
    if (removeUnit && cancelledJob?.productUnitId && before.productUnitId === null) {
      await removeProductUnitWithin({ actorUserId, id: cancelledJob.productUnitId, tx });
    }
  });
}

export async function createQuote({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuoteCreateInput;
}): Promise<QuoteDetail> {
  return db.transaction(async (tx) => {
    const customerId = await resolveQuoteCustomer({ actorUserId, input, tx });
    const offering = await resolveQuoteOffering({ input, tx });
    const workItems = input.offering.kind === 'custom' ? input.offering.workItems : [];
    assertValidDiscount({ discountPercent: input.discountPercent });
    await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });

    const [row] = await tx
      .insert(quotes)
      .values({
        cancellationReason: input.cancellationReason,
        customerId,
        depositPercent: input.depositPercent,
        deliveryIncluded: input.deliveryIncluded,
        deliveryPrice: input.deliveryPrice,
        discountPercent: input.discountPercent,
        kind: offering.kind,
        invoiceNumber: input.invoiceNumber,
        notes: input.notes,
        documentNotes: input.documentNotes,
        plannedDeliveryDate: input.plannedDeliveryDate,
        preferredDeliveryDate: input.preferredDeliveryDate,
        productId: offering.productId,
        productUnitId: offering.productUnitId,
        quotedBasePrice: offering.quotedBasePrice,
        quotedCurrencyCode: offering.quotedCurrencyCode,
        salesPersonId: input.salesPersonId,
        status: input.status,
        validUntil: input.validUntil,
        workTitle: offering.workTitle,
      })
      .returning();

    if (!row) {
      throw new Error('Quote insert did not return a row');
    }

    const persistedOffering = narrowQuoteOffering(row);
    const selectedAssemblyInput = mergeAllocationSeed({
      input: input.selectedAssemblies,
      seed: offering.allocationSeed,
    });
    const selectedAssemblies =
      persistedOffering.kind === 'product'
        ? await persistQuoteSelectedAssemblies({
            quoteId: row.id,
            resolved: await resolveQuoteSelectedAssemblies({
              productId: persistedOffering.productId,
              quoteId: row.id,
              selectedAssemblies: selectedAssemblyInput,
              tx,
            }),
            tx,
          })
        : [];
    const persistedWorkItems =
      persistedOffering.kind === 'custom' ? await persistQuoteWorkItems({ quoteId: row.id, tx, workItems }) : [];

    await transferAllocationQuoteOnAcceptance({
      actorUserId,
      previousStatus: null,
      quote: row,
      tx,
    });

    await recordAuditCreate({
      db: tx,
      descriptor: quoteAuditDescriptor,
      actorUserId,
      input: { row, selectedAssemblies, workItems: persistedWorkItems },
    });

    return getQuote({ db: tx, id: row.id });
  });
}

export async function updateQuote({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuoteUpdateInput;
}): Promise<QuoteDetail> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(quotes).where(eq(quotes.id, input.id)).for('update');

    if (!before) {
      throw new QuoteNotFoundError(input.id);
    }

    const beforeOffering = narrowQuoteOffering(before);

    if (input.offering.kind !== beforeOffering.kind) {
      throw new QuoteInvalidReferenceError('Quote offering kind cannot be changed.');
    }

    if (beforeOffering.kind === 'custom') {
      assertNoCustomSelectedAssemblies(input);
    }

    assertNotCancellingByUpdate({ before: before.status, next: input.status });

    const collectionInput: QuoteCollectionPatchInput = {
      selectedAssemblies: input.selectedAssemblies,
      workItems: input.offering.kind === 'custom' ? input.offering.workItems : undefined,
    };
    assertValidDiscount({ discountPercent: input.discountPercent });

    await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });

    const patch = {
      cancellationReason: input.cancellationReason,
      customerId: before.customerId,
      depositPercent: input.depositPercent,
      deliveryIncluded: input.deliveryIncluded,
      deliveryPrice: input.deliveryPrice,
      discountPercent: input.discountPercent,
      kind: before.kind,
      invoiceNumber: input.invoiceNumber,
      notes: input.notes,
      documentNotes: input.documentNotes,
      plannedDeliveryDate: input.plannedDeliveryDate,
      preferredDeliveryDate: input.preferredDeliveryDate,
      productId: before.productId,
      quotedBasePrice: before.quotedBasePrice,
      quotedCurrencyCode: before.quotedCurrencyCode,
      salesPersonId: input.salesPersonId,
      status: input.status,
      validUntil: input.validUntil,
      workTitle: input.offering.kind === 'custom' ? input.offering.workTitle : before.workTitle,
    };
    const after = { ...before, ...patch };
    const collections = await prepareQuoteCollectionPatch({
      input: collectionInput,
      offering: beforeOffering,
      quoteId: before.id,
      tx,
    });
    const changes = diffAuditUpdate(
      quoteAuditDescriptor,
      {
        row: before,
        selectedAssemblies: collections.beforeSelectedAssemblies,
        workItems: collections.beforeWorkItems,
      },
      {
        row: after,
        selectedAssemblies: collections.resolved.rows,
        workItems: collections.nextWorkItems,
      },
    );
    const changedFields = toQuoteChangedFields({ changes, collections });

    if (changedFields.size === 0) {
      return getQuote({ db: tx, id: before.id });
    }

    const editable = assertQuoteEditable({
      changedFields,
      hasEverSourcedJob: await quoteHasEverSourcedJob({ quoteId: before.id, tx }),
      hasProductUnit: before.productUnitId !== null,
      kind: before.kind,
      status: before.status,
    });

    if (!editable.allowed) {
      throw new QuoteLockedError(editable.reason);
    }

    await transferAllocationQuoteOnAcceptance({
      actorUserId,
      previousStatus: before.status,
      quote: after,
      tx,
    });

    const [row] = await tx
      .update(quotes)
      .set({
        ...patch,
        updatedAt: new Date(),
        ...(input.status === before.status ? {} : { statusChangedAt: new Date() }),
      })
      .where(eq(quotes.id, input.id))
      .returning();

    if (!row) {
      throw new QuoteNotFoundError(input.id);
    }

    const { selectedAssemblies, workItems } = await persistQuoteCollectionPatch({
      collections,
      input: collectionInput,
      offering: beforeOffering,
      quoteId: row.id,
      tx,
    });

    if (changes) {
      await recordAuditUpdate({
        db: tx,
        descriptor: quoteAuditDescriptor,
        actorUserId,
        after: { row, selectedAssemblies, workItems },
        changes,
      });
    }

    return getQuote({ db: tx, id: row.id });
  });
}

/**
 * Applies only the fields present in `input` over the current row, all under the same row
 * lock as the write. Fields left `undefined` are read from the locked row, so a concurrent edit to an
 * omitted field (e.g. pricing) is never reverted. Selected assemblies are complete replacements
 * only when supplied. Offering and quote-level pricing are never touched. Used by the
 * assistant's partial Quote update tool.
 */
export async function patchQuote({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuotePatchInput;
}): Promise<QuoteDetail> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(quotes).where(eq(quotes.id, input.id)).for('update');

    if (!before) {
      throw new QuoteNotFoundError(input.id);
    }

    const beforeOffering = narrowQuoteOffering(before);

    if (beforeOffering.kind === 'custom') {
      assertNoCustomSelectedAssemblies(input);
    }
    if (input.salesPersonId !== undefined && input.salesPersonId !== before.salesPersonId) {
      await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });
    }

    assertNotCancellingByUpdate({ before: before.status, next: input.status });

    // `undefined` keeps the current value; an explicit `null` clears a nullable field.
    const patch = {
      cancellationReason: input.cancellationReason !== undefined ? input.cancellationReason : before.cancellationReason,
      documentNotes: input.documentNotes !== undefined ? input.documentNotes : before.documentNotes,
      invoiceNumber: input.invoiceNumber !== undefined ? input.invoiceNumber : before.invoiceNumber,
      notes: input.notes !== undefined ? input.notes : before.notes,
      plannedDeliveryDate:
        input.plannedDeliveryDate !== undefined ? input.plannedDeliveryDate : before.plannedDeliveryDate,
      preferredDeliveryDate:
        input.preferredDeliveryDate !== undefined ? input.preferredDeliveryDate : before.preferredDeliveryDate,
      salesPersonId: input.salesPersonId ?? before.salesPersonId,
      status: input.status ?? before.status,
      validUntil: input.validUntil !== undefined ? input.validUntil : before.validUntil,
    };
    const after = { ...before, ...patch };
    const collections = await prepareQuoteCollectionPatch({
      input,
      offering: beforeOffering,
      quoteId: before.id,
      tx,
    });
    const changes = diffAuditUpdate(
      quoteAuditDescriptor,
      {
        row: before,
        selectedAssemblies: collections.beforeSelectedAssemblies,
        workItems: collections.beforeWorkItems,
      },
      {
        row: after,
        selectedAssemblies: collections.resolved.rows,
        workItems: collections.nextWorkItems,
      },
    );
    const changedFields = toQuoteChangedFields({ changes, collections });

    if (changedFields.size === 0) {
      return getQuote({ db: tx, id: before.id });
    }

    const editable = assertQuoteEditable({
      changedFields,
      hasEverSourcedJob: await quoteHasEverSourcedJob({ quoteId: before.id, tx }),
      hasProductUnit: before.productUnitId !== null,
      kind: before.kind,
      status: before.status,
    });

    if (!editable.allowed) {
      throw new QuoteLockedError(editable.reason);
    }

    await transferAllocationQuoteOnAcceptance({
      actorUserId,
      previousStatus: before.status,
      quote: after,
      tx,
    });

    const [row] = await tx
      .update(quotes)
      .set({
        ...patch,
        updatedAt: new Date(),
        ...(patch.status === before.status ? {} : { statusChangedAt: new Date() }),
      })
      .where(eq(quotes.id, input.id))
      .returning();

    if (!row) {
      throw new QuoteNotFoundError(input.id);
    }

    const { selectedAssemblies, workItems } = await persistQuoteCollectionPatch({
      collections,
      input,
      offering: beforeOffering,
      quoteId: row.id,
      tx,
    });

    if (changes) {
      await recordAuditUpdate({
        db: tx,
        descriptor: quoteAuditDescriptor,
        actorUserId,
        after: { row, selectedAssemblies, workItems },
        changes,
      });
    }

    return getQuote({ db: tx, id: row.id });
  });
}

async function prepareQuoteCollectionPatch({
  input,
  offering,
  quoteId,
  tx,
}: {
  input: QuoteCollectionPatchInput;
  offering: ReturnType<typeof narrowQuoteOffering>;
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<QuoteCollectionPatch> {
  const [beforeSelectedAssemblies, beforeWorkItems] = await Promise.all([
    listQuoteSelectedAssemblies({ quoteId, tx }),
    listQuoteWorkItems({ quoteId, tx }),
  ]);
  const nextWorkItems = input.workItems ?? beforeWorkItems;
  const resolved =
    offering.kind === 'product' && input.selectedAssemblies !== undefined
      ? await resolveQuoteSelectedAssemblies({
          currentRows: beforeSelectedAssemblies,
          productId: offering.productId,
          quoteId,
          selectedAssemblies: input.selectedAssemblies,
          tx,
        })
      : { newRows: [], removeIds: [], rows: beforeSelectedAssemblies };

  return {
    beforeSelectedAssemblies,
    beforeWorkItems,
    nextWorkItems,
    resolved,
    selectedAssembliesChanged: resolved.newRows.length > 0 || resolved.removeIds.length > 0,
    workItemsChanged: haveQuoteWorkItemsChanged({ before: beforeWorkItems, next: input.workItems }),
  };
}

function toQuoteChangedFields({
  changes,
  collections,
}: {
  changes: AuditChanges | null;
  collections: QuoteCollectionPatch;
}): Set<string> {
  // Per-element audit keys normalize back to their collection field so the Locked Quote gate and
  // its error message speak in field names. The booleans also catch reorder-only collection changes.
  const changedFields = new Set(
    Object.keys(changes ?? {}).map((field) =>
      field.startsWith('workItem:')
        ? 'workItems'
        : field.startsWith('selectedAssembly:')
          ? 'selectedAssemblies'
          : field,
    ),
  );

  if (collections.selectedAssembliesChanged) {
    changedFields.add('selectedAssemblies');
  }

  if (collections.workItemsChanged) {
    changedFields.add('workItems');
  }

  return changedFields;
}

async function persistQuoteCollectionPatch({
  collections,
  input,
  offering,
  quoteId,
  tx,
}: {
  collections: QuoteCollectionPatch;
  input: QuoteCollectionPatchInput;
  offering: ReturnType<typeof narrowQuoteOffering>;
  quoteId: UUID;
  tx: DatabaseTransaction;
}) {
  const selectedAssemblies =
    offering.kind === 'product' && input.selectedAssemblies !== undefined
      ? await persistQuoteSelectedAssemblies({ quoteId, resolved: collections.resolved, tx })
      : collections.resolved.rows;
  const workItems =
    offering.kind === 'product' || input.workItems === undefined || !collections.workItemsChanged
      ? collections.beforeWorkItems
      : await persistQuoteWorkItems({ quoteId, tx, workItems: input.workItems });

  return { selectedAssemblies, workItems };
}

function haveQuoteWorkItemsChanged({
  before,
  next,
}: {
  before: readonly QuoteWorkItemRow[];
  next: readonly QuoteWorkItemInput[] | undefined;
}): boolean {
  if (next === undefined) return false;
  if (before.length !== next.length) return true;

  return next.some((item, position) => {
    const current = before[position];
    if (
      !current ||
      current.position !== position ||
      current.department !== item.department ||
      current.description !== item.description ||
      current.hourlyRate !== item.hourlyRate ||
      current.name !== item.name ||
      current.hours !== item.hours ||
      current.parts.length !== item.parts.length
    ) {
      return true;
    }

    return item.parts.some((part, partPosition) => {
      const currentPart = current.parts[partPosition];
      return (
        !currentPart ||
        currentPart.position !== partPosition ||
        currentPart.name !== part.name ||
        currentPart.quantity !== part.quantity ||
        currentPart.unitPrice !== part.unitPrice
      );
    });
  });
}

async function resolveQuoteCustomer({
  actorUserId,
  input,
  tx,
}: {
  actorUserId: AuthId;
  input: Pick<QuoteCreateInput, 'customer'>;
  tx: DatabaseTransaction;
}): Promise<UUID> {
  if (input.customer.type === 'existing') {
    await assertQuoteCustomer({ customerId: input.customer.customerId, tx });
    return input.customer.customerId;
  }

  const [customer] = await tx
    .insert(customers)
    .values({
      address: input.customer.address,
      companyName: input.customer.companyName,
      contactPerson: input.customer.contactPerson,
      email: input.customer.email,
      phone: input.customer.phone,
    })
    .returning();

  if (!customer) {
    throw new Error('Inline customer insert did not return a row');
  }

  await recordAuditCreate({ db: tx, descriptor: customerAuditDescriptor, actorUserId, input: customer });

  return customer.id;
}

async function resolveQuoteOffering({
  input,
  tx,
}: {
  input: Pick<QuoteCreateInput, 'offering' | 'selectedAssemblies' | 'status'>;
  tx: DatabaseTransaction;
}): Promise<QuoteOfferingRow & { allocationSeed: QuoteSelectedAssemblyInput[] }> {
  if (input.offering.kind === 'custom') {
    assertNoCustomSelectedAssemblies(input);

    return {
      allocationSeed: [],
      kind: 'custom',
      productId: null,
      productUnitId: null,
      // Custom Quotes carry no Base price: every rand comes from their Work Items.
      quotedBasePrice: 0,
      quotedCurrencyCode: DEFAULT_PRODUCT_CURRENCY_CODE,
      workTitle: input.offering.workTitle,
    };
  }

  const [product] = await tx
    .select({
      basePrice: products.basePrice,
      currencyCode: products.currencyCode,
      id: products.id,
    })
    .from(products)
    .where(and(eq(products.id, input.offering.productId), notRemoved(products)))
    .for('update')
    .limit(1);

  if (!product) {
    throw new QuoteInvalidReferenceError('Quote product was not found.');
  }

  const allocationSeed = input.offering.productUnitId
    ? await resolveAllocationQuoteSeed({
        accepting: input.status === 'accepted',
        productId: product.id,
        productUnitId: input.offering.productUnitId,
        tx,
      })
    : [];

  return {
    allocationSeed,
    kind: 'product',
    productId: product.id,
    productUnitId: input.offering.productUnitId,
    quotedBasePrice: product.basePrice,
    quotedCurrencyCode: product.currencyCode,
    workTitle: null,
  };
}

function assertNoCustomSelectedAssemblies(
  input: Pick<QuoteCreateInput | QuotePatchInput | QuoteUpdateInput, 'selectedAssemblies'>,
): void {
  if ((input.selectedAssemblies?.length ?? 0) > 0) {
    throw new QuoteCustomSelectedAssembliesError(`${quoteKindLabels.custom} Quotes cannot have Selected Assemblies.`);
  }
}

async function assertQuoteCustomer({ customerId, tx }: { customerId: UUID; tx: DatabaseTransaction }): Promise<void> {
  const [customer] = await tx
    .select({
      id: customers.id,
    })
    .from(customers)
    .where(eq(customers.id, customerId));

  if (!customer) {
    throw new QuoteInvalidReferenceError('Quote customer was not found.');
  }
}

async function assertQuoteSalesPerson({
  salesPersonId,
  tx,
}: {
  salesPersonId: AuthId;
  tx: DatabaseTransaction;
}): Promise<void> {
  const [salesPerson] = await tx
    .select({
      id: user.id,
    })
    .from(user)
    .where(and(eq(user.id, salesPersonId), inArray(user.role, [...QUOTE_SALESPERSON_ROLES])));

  if (!salesPerson) {
    throw new QuoteInvalidReferenceError('Quote salesperson must be a sales, admin, or super-admin user.');
  }
}

function assertValidDiscount({ discountPercent }: { discountPercent: number }): void {
  const result = validateDiscount({ discountPercent });

  if (!result.allowed) {
    throw new QuoteDiscountInvalidError(result.reason);
  }
}

/**
 * An edit may carry `cancelled` because the Quote was already cancelled — its notes stay editable
 * afterwards — but it may never be what does the cancelling. That decision settles the Job and the
 * machine too, and only {@link cancelQuote} knows how.
 */
function assertNotCancellingByUpdate({ before, next }: { before: QuoteStatus; next: QuoteStatus | undefined }): void {
  if (next === 'cancelled' && before !== 'cancelled') {
    throw new QuoteCancelNotAnUpdateError();
  }
}

async function quoteHasLiveJob({ quoteId, tx }: { quoteId: UUID; tx: DatabaseTransaction }): Promise<boolean> {
  const [job] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.quoteId, quoteId), isNull(jobs.cancelledAt)))
    .limit(1);

  return Boolean(job);
}

/**
 * Whether this Quote has ever sourced production, and so is Locked.
 *
 * A `job.quote_id` row is the everyday evidence and survives cancellation, which is why cancelling a
 * Job cannot unlock its Quote. Reassignment takes that row away — the build Job moves to another deal
 * outright — so the Ownership Transfer the Quote wrote when it placed the machine stands in for it.
 * Either is proof; a deal that has put metal in a Bay does not become editable again.
 */
async function quoteHasEverSourcedJob({ quoteId, tx }: { quoteId: UUID; tx: DatabaseTransaction }): Promise<boolean> {
  if (await quoteHoldsAnyJobRow({ quoteId, tx })) {
    return true;
  }

  return quoteEverPlacedAUnit({ db: tx, quoteId });
}

/**
 * Whether any Job — live or cancelled — still names this Quote. This is the Quote's *claim* on a
 * machine, which reassignment genuinely does remove: once the build Job belongs to another deal, this
 * one has no machine to settle. Distinct from {@link quoteHasEverSourcedJob}, which asks about history
 * and must stay true forever.
 */
async function quoteHoldsAnyJobRow({ quoteId, tx }: { quoteId: UUID; tx: DatabaseTransaction }): Promise<boolean> {
  const [job] = await tx
    .select({
      id: jobs.id,
    })
    .from(jobs)
    .where(eq(jobs.quoteId, quoteId))
    .limit(1);

  return Boolean(job);
}
