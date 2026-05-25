import { type DatabaseTransaction, getUniqueViolationConstraint, productOptions } from '@pkg/db';
import type { AuthId, ProductOptionCreateInput, ProductOptionUpsertInput, UUID } from '@pkg/schema';
import { ProductOption } from '@pkg/schema';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, productOptionAuditDescriptor } from '../audit/audit-service.js';
import { DuplicateProductOptionCodeError, ProductOptionNotFoundError } from './product-errors.js';

type ProductOptionRow = typeof productOptions.$inferSelect;

export function mapProductOption(row: ProductOptionRow): ProductOption {
  return ProductOption.parse({
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name,
    price: row.price,
    productId: row.productId,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function insertProductOptions({
  tx,
  productId,
  incomingOptions,
  actorUserId,
}: {
  tx: DatabaseTransaction;
  productId: UUID;
  incomingOptions: ProductOptionCreateInput[];
  actorUserId: AuthId;
}): Promise<ProductOptionRow[]> {
  if (incomingOptions.length === 0) {
    return [];
  }

  try {
    const rows = await tx
      .insert(productOptions)
      .values(incomingOptions.map((option) => ({ ...option, productId })))
      .returning();

    await Promise.all(
      rows.map((row) =>
        insertAuditEvent({
          db: tx,
          input: {
            action: 'created',
            actorUserId,
            after: row,
            before: null,
            changes: null,
            entityId: row.id,
            entityType: productOptionAuditDescriptor.entityType,
          },
        }),
      ),
    );

    return rows;
  } catch (error) {
    throw mapProductOptionUniqueViolation(error, incomingOptions);
  }
}

export async function syncProductOptions({
  tx,
  productId,
  incomingOptions,
  actorUserId,
}: {
  tx: DatabaseTransaction;
  productId: UUID;
  incomingOptions: ProductOptionUpsertInput[];
  actorUserId: AuthId;
}): Promise<ProductOptionRow[]> {
  try {
    const existingOptions = await tx
      .select()
      .from(productOptions)
      .where(and(eq(productOptions.productId, productId), isNull(productOptions.deletedAt)))
      .for('update');
    const existingById = new Map(existingOptions.map((option) => [option.id, option]));
    const incomingIds = new Set(incomingOptions.flatMap((option) => (option.id ? [option.id] : [])));
    const now = new Date();

    for (const incomingOption of incomingOptions) {
      if (incomingOption.id && !existingById.has(incomingOption.id)) {
        throw new ProductOptionNotFoundError(incomingOption.id);
      }
    }

    const optionsToDelete = existingOptions.filter((option) => !incomingIds.has(option.id));

    if (optionsToDelete.length > 0) {
      const deletedIds = optionsToDelete.map((option) => option.id);
      await tx
        .update(productOptions)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(productOptions.productId, productId),
            inArray(productOptions.id, deletedIds),
            isNull(productOptions.deletedAt),
          ),
        );

      await Promise.all(
        optionsToDelete.map((option) =>
          insertAuditEvent({
            db: tx,
            input: {
              action: 'deleted',
              actorUserId,
              after: null,
              before: option,
              changes: null,
              entityId: option.id,
              entityType: productOptionAuditDescriptor.entityType,
            },
          }),
        ),
      );
    }

    for (const incomingOption of incomingOptions) {
      if (!incomingOption.id) {
        continue;
      }

      const before = existingById.get(incomingOption.id);
      if (!before) {
        throw new ProductOptionNotFoundError(incomingOption.id);
      }

      const after = {
        ...before,
        code: incomingOption.code,
        name: incomingOption.name,
        price: incomingOption.price,
      };
      const changes = createAuditChanges(before, after, productOptionAuditDescriptor.fields);

      if (!changes) {
        continue;
      }

      const [row] = await tx
        .update(productOptions)
        .set({
          code: incomingOption.code,
          name: incomingOption.name,
          price: incomingOption.price,
          updatedAt: now,
        })
        .where(and(eq(productOptions.productId, productId), eq(productOptions.id, incomingOption.id)))
        .returning();

      if (!row) {
        throw new ProductOptionNotFoundError(incomingOption.id);
      }

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'updated',
          actorUserId,
          after: row,
          before,
          changes,
          entityId: row.id,
          entityType: productOptionAuditDescriptor.entityType,
        },
      });
    }

    await insertProductOptions({
      tx,
      productId,
      incomingOptions: incomingOptions.filter((option) => !option.id),
      actorUserId,
    });

    return await tx
      .select()
      .from(productOptions)
      .where(and(eq(productOptions.productId, productId), isNull(productOptions.deletedAt)))
      .orderBy(asc(productOptions.code));
  } catch (error) {
    throw mapProductOptionUniqueViolation(error, incomingOptions);
  }
}

function mapProductOptionUniqueViolation(
  error: unknown,
  incomingOptions: Array<Pick<ProductOptionCreateInput, 'code'>>,
): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (
    constraint?.includes('product_options_active_product_id_code_unique') ||
    constraint?.includes('product_id_code')
  ) {
    return new DuplicateProductOptionCodeError(incomingOptions[0]?.code ?? 'unknown');
  }

  return error instanceof Error ? error : new Error(String(error));
}
