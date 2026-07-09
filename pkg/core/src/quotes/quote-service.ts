import { customers, type DatabaseTransaction, type Db, jobs, notRemoved, products, quotes, user } from '@pkg/db';
import { assertQuoteEditable, validateDiscount } from '@pkg/domain';
import {
  type AuthId,
  DEFAULT_PRODUCT_CURRENCY_CODE,
  type QuoteCreateInput,
  type QuoteDetail,
  type QuoteFieldUpdateInput,
  type QuoteKind,
  type QuoteLineItemInput,
  type QuoteUpdateInput,
  type UUID,
} from '@pkg/schema';
import { and, eq, inArray } from 'drizzle-orm';

import { diffAuditUpdate, recordAuditCreate, recordAuditUpdate } from '../audit/audit-service.js';
import { customerAuditDescriptor } from '../customers/customer-service.js';
import { quoteAuditDescriptor } from './quote-audit.js';
import {
  QuoteCustomSelectedAssembliesError,
  QuoteDiscountInvalidError,
  QuoteInvalidReferenceError,
  QuoteLockedError,
  QuoteNotFoundError,
} from './quote-errors.js';
import { listQuoteLineItems, persistQuoteLineItems, type QuoteLineItemRow } from './quote-line-items.js';
import { narrowQuoteOffering } from './quote-offering.js';
import { getQuote } from './quote-read-service.js';
import {
  listQuoteSelectedAssemblies,
  persistQuoteSelectedAssemblies,
  resolveQuoteSelectedAssemblies,
} from './quote-selected-assemblies.js';

type QuoteOfferingRow = {
  kind: QuoteKind;
  productId: UUID | null;
  quotedBasePrice: number;
  quotedCurrencyCode: string;
  workTitle: string | null;
};

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
    assertValidDiscount({ discountPercent: input.discountPercent });
    await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });

    const [row] = await tx
      .insert(quotes)
      .values({
        customerId,
        depositPercent: input.depositPercent,
        deliveryIncluded: input.deliveryIncluded,
        deliveryPrice: input.deliveryIncluded ? input.deliveryPrice : 0,
        discountPercent: input.discountPercent,
        kind: offering.kind,
        notes: input.notes,
        documentNotes: input.documentNotes,
        plannedDeliveryDate: input.plannedDeliveryDate,
        preferredDeliveryDate: input.preferredDeliveryDate,
        productId: offering.productId,
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
    const selectedAssemblies =
      persistedOffering.kind === 'product'
        ? await persistQuoteSelectedAssemblies({
            quoteId: row.id,
            resolved: await resolveQuoteSelectedAssemblies({
              productId: persistedOffering.productId,
              quoteId: row.id,
              selectedAssemblies: input.selectedAssemblies,
              tx,
            }),
            tx,
          })
        : [];
    const lineItems = await persistQuoteLineItems({ lineItems: input.lineItems, quoteId: row.id, tx });

    await recordAuditCreate({
      db: tx,
      descriptor: quoteAuditDescriptor,
      actorUserId,
      input: { row, lineItems, selectedAssemblies },
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

    const beforeSelectedAssemblies = await listQuoteSelectedAssemblies({ quoteId: before.id, tx });
    const beforeLineItems = await listQuoteLineItems({ quoteId: before.id, tx });
    const beforeOffering = narrowQuoteOffering(before);

    if (input.offering.kind !== beforeOffering.kind) {
      throw new QuoteInvalidReferenceError('Quote offering kind cannot be changed.');
    }

    if (beforeOffering.kind === 'custom') {
      assertNoCustomSelectedAssemblies(input);
    }

    assertValidDiscount({ discountPercent: input.discountPercent });

    await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });

    const patch = {
      customerId: before.customerId,
      depositPercent: input.depositPercent,
      deliveryIncluded: input.deliveryIncluded,
      deliveryPrice: input.deliveryIncluded ? input.deliveryPrice : 0,
      discountPercent: input.discountPercent,
      kind: before.kind,
      notes: input.notes,
      documentNotes: input.documentNotes,
      plannedDeliveryDate: input.plannedDeliveryDate,
      preferredDeliveryDate: input.preferredDeliveryDate,
      productId: before.productId,
      quotedBasePrice: input.offering.kind === 'custom' ? input.offering.basePrice : before.quotedBasePrice,
      quotedCurrencyCode: before.quotedCurrencyCode,
      salesPersonId: input.salesPersonId,
      status: input.status,
      validUntil: input.validUntil,
      workTitle: input.offering.kind === 'custom' ? input.offering.workTitle : before.workTitle,
    };
    const after = { ...before, ...patch };
    const nextLineItems = input.lineItems ?? beforeLineItems;
    const resolved =
      beforeOffering.kind === 'product' && input.selectedAssemblies !== undefined
        ? await resolveQuoteSelectedAssemblies({
            currentRows: beforeSelectedAssemblies,
            productId: beforeOffering.productId,
            quoteId: before.id,
            selectedAssemblies: input.selectedAssemblies,
            tx,
          })
        : { newRows: [], removeIds: [], rows: beforeSelectedAssemblies };
    const changes = diffAuditUpdate(
      quoteAuditDescriptor,
      { row: before, lineItems: beforeLineItems, selectedAssemblies: beforeSelectedAssemblies },
      { row: after, lineItems: nextLineItems, selectedAssemblies: resolved.rows },
    );
    const lineItemsChanged = haveQuoteLineItemsChanged({ before: beforeLineItems, next: input.lineItems });
    const selectedAssembliesChanged = resolved.newRows.length > 0 || resolved.removeIds.length > 0;
    const changedFields = new Set(Object.keys(changes ?? {}));

    if (lineItemsChanged) {
      changedFields.add('lineItems');
    }

    if (selectedAssembliesChanged) {
      changedFields.add('selectedAssemblies');
    }

    if (changedFields.size === 0) {
      return getQuote({ db: tx, id: before.id });
    }

    const editable = assertQuoteEditable({
      changedFields,
      hasJob: await quoteHasJob({ quoteId: before.id, tx }),
      kind: before.kind,
      status: before.status,
    });

    if (!editable.allowed) {
      throw new QuoteLockedError(editable.reason);
    }

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

    const selectedAssemblies =
      before.kind === 'product' && input.selectedAssemblies !== undefined
        ? await persistQuoteSelectedAssemblies({ quoteId: row.id, resolved, tx })
        : resolved.rows;
    const lineItems =
      input.lineItems === undefined
        ? beforeLineItems
        : await persistQuoteLineItems({ lineItems: input.lineItems, quoteId: row.id, tx });

    if (changes) {
      await recordAuditUpdate({
        db: tx,
        descriptor: quoteAuditDescriptor,
        actorUserId,
        after: { row, lineItems, selectedAssemblies },
        changes,
      });
    }

    return getQuote({ db: tx, id: row.id });
  });
}

/**
 * Applies only the low-risk fields present in `input` over the current row, all under the same row
 * lock as the write. Fields left `undefined` are read from the locked row, so a concurrent edit to an
 * omitted field (e.g. pricing) is never reverted. Offering, pricing, line items, and assemblies are
 * never touched. Used by the assistant's partial Quote update tool.
 */
export async function updateQuoteFields({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuoteFieldUpdateInput;
}): Promise<QuoteDetail> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(quotes).where(eq(quotes.id, input.id)).for('update');

    if (!before) {
      throw new QuoteNotFoundError(input.id);
    }

    if (input.salesPersonId !== undefined && input.salesPersonId !== before.salesPersonId) {
      await assertQuoteSalesPerson({ salesPersonId: input.salesPersonId, tx });
    }

    // `undefined` keeps the current value; an explicit `null` clears a nullable field.
    const patch = {
      documentNotes: input.documentNotes !== undefined ? input.documentNotes : before.documentNotes,
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
    // Line items and assemblies never change here; pass the current rows on both sides of the diff.
    const beforeLineItems = await listQuoteLineItems({ quoteId: before.id, tx });
    const beforeSelectedAssemblies = await listQuoteSelectedAssemblies({ quoteId: before.id, tx });
    const changes = diffAuditUpdate(
      quoteAuditDescriptor,
      { row: before, lineItems: beforeLineItems, selectedAssemblies: beforeSelectedAssemblies },
      { row: after, lineItems: beforeLineItems, selectedAssemblies: beforeSelectedAssemblies },
    );
    const changedFields = new Set(Object.keys(changes ?? {}));

    if (changedFields.size === 0) {
      return getQuote({ db: tx, id: before.id });
    }

    const editable = assertQuoteEditable({
      changedFields,
      hasJob: await quoteHasJob({ quoteId: before.id, tx }),
      kind: before.kind,
      status: before.status,
    });

    if (!editable.allowed) {
      throw new QuoteLockedError(editable.reason);
    }

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

    if (changes) {
      await recordAuditUpdate({
        db: tx,
        descriptor: quoteAuditDescriptor,
        actorUserId,
        after: { row, lineItems: beforeLineItems, selectedAssemblies: beforeSelectedAssemblies },
        changes,
      });
    }

    return getQuote({ db: tx, id: row.id });
  });
}

function haveQuoteLineItemsChanged({
  before,
  next,
}: {
  before: readonly QuoteLineItemRow[];
  next: readonly QuoteLineItemInput[] | undefined;
}): boolean {
  if (next === undefined) {
    return false;
  }

  if (before.length !== next.length) {
    return true;
  }

  return next.some((item, position) => {
    const current = before[position];

    return (
      !current ||
      current.position !== position ||
      current.name !== item.name ||
      current.quantity !== item.quantity ||
      current.unitPrice !== item.unitPrice
    );
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
  input: Pick<QuoteCreateInput, 'offering' | 'selectedAssemblies'>;
  tx: DatabaseTransaction;
}): Promise<QuoteOfferingRow> {
  if (input.offering.kind === 'custom') {
    assertNoCustomSelectedAssemblies(input);

    return {
      kind: 'custom',
      productId: null,
      quotedBasePrice: input.offering.basePrice,
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

  return {
    kind: 'product',
    productId: product.id,
    quotedBasePrice: product.basePrice,
    quotedCurrencyCode: product.currencyCode,
    workTitle: null,
  };
}

function assertNoCustomSelectedAssemblies(
  input: Pick<QuoteCreateInput | QuoteUpdateInput, 'selectedAssemblies'>,
): void {
  if ((input.selectedAssemblies?.length ?? 0) > 0) {
    throw new QuoteCustomSelectedAssembliesError('Custom Quotes cannot have Selected Assemblies.');
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
    .where(and(eq(user.id, salesPersonId), inArray(user.role, ['super-admin', 'admin', 'sales'])));

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

async function quoteHasJob({ quoteId, tx }: { quoteId: UUID; tx: DatabaseTransaction }): Promise<boolean> {
  const [job] = await tx
    .select({
      id: jobs.id,
    })
    .from(jobs)
    .where(eq(jobs.quoteId, quoteId))
    .limit(1);

  return Boolean(job);
}
