import {
  creditNoteSettlements,
  type DatabaseTransaction,
  type Db,
  documents,
  parts,
  purchaseOrders,
  stockMovements,
  supplier,
  user,
} from '@pkg/db';
import { diffDateOnlyDays, toPlantDateOnly } from '@pkg/domain';
import type {
  AuthId,
  CreditNoteSettlementInput,
  PurchaseOrderDocumentListResult,
  PurchaseOrderDocumentRow,
  PurchaseOrderReturnListResult,
  ReturnsAwaitingCreditResult,
  UUID,
} from '@pkg/schema';
import {
  DateOnlyIso,
  PurchaseOrderDocumentListResult as PurchaseOrderDocumentListResultSchema,
  PurchaseOrderDocumentMetadata,
  PurchaseOrderReturnListResult as PurchaseOrderReturnListResultSchema,
  ReturnsAwaitingCreditResult as ReturnsAwaitingCreditResultSchema,
} from '@pkg/schema';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import type { StorageAdapter } from '../documents/storage-adapter.js';
import { CreditNoteAlreadySettledError, CreditNoteReturnNotFoundError } from './credit-note-errors.js';
import { filePurchaseOrderDocument } from './purchase-order-document-filing.js';
import { getPurchaseOrder, newestPurchaseOrderDocumentFirst } from './purchase-order-service.js';

/**
 * Credit notes and the returns they answer (spec §4).
 *
 * A credit note is filed into the order's own document collection, the same infrastructure the
 * as-sent PDF and the supplier invoice use. What makes it more than another PDF is the reference it
 * carries: which `return-to-supplier` movements it settles. That reference lives beside the
 * document rather than on the movement because ledger rows are immutable — and it is per-movement,
 * because an order that sent two things back and got one credit is exactly the case a PO-level
 * "has a credit note" flag would go blind on (spec §12).
 */

/**
 * Files a supplier credit against an order and records the returns it answers, in one transaction.
 *
 * The settlement is written with the document rather than after it, so a credit note can never sit
 * in the collection while the returns it paid for stay on the awaiting-credit list.
 */
export async function uploadCreditNote({
  actorUserId,
  bytes,
  db,
  filename,
  input,
  storage,
}: {
  actorUserId: AuthId;
  bytes: Uint8Array;
  db: Db;
  filename: string;
  input: CreditNoteSettlementInput;
  storage: StorageAdapter;
}): Promise<PurchaseOrderDocumentRow> {
  await getPurchaseOrder({ db, id: input.purchaseOrderId });

  return filePurchaseOrderDocument({
    actorUserId,
    assertWritable: (tx) => assertReturnsAreSettleable(tx, input),
    bytes,
    db,
    filename,
    metadata: { type: 'credit_note' },
    purchaseOrderId: input.purchaseOrderId,
    settledReturnIds: input.stockMovementIds,
    storage,
    writeReferences: async (tx, document) => {
      await tx.insert(creditNoteSettlements).values(
        input.stockMovementIds.map((stockMovementId) => ({
          documentId: document.id,
          stockMovementId,
        })),
      );
    },
  });
}

/** An order's whole document collection: its PDF revisions and the credit notes filed against it. */
export async function listPurchaseOrderDocuments({
  db,
  purchaseOrderId,
}: {
  db: Db;
  purchaseOrderId: UUID;
}): Promise<PurchaseOrderDocumentListResult> {
  await getPurchaseOrder({ db, id: purchaseOrderId });
  const rows = await db
    .select({
      byteSize: documents.byteSize,
      contentType: documents.contentType,
      createdAt: documents.createdAt,
      filename: documents.filename,
      id: documents.id,
      metadata: documents.metadata,
      uploaderName: user.name,
    })
    .from(documents)
    .leftJoin(user, eq(user.id, documents.uploaderUserId))
    .where(eq(documents.purchaseOrderId, purchaseOrderId))
    // The same ordering the order's own "current PDF" read uses, so the head of this list is that PDF.
    .orderBy(newestPurchaseOrderDocumentFirst);
  const settlements = await loadSettlementsByDocument(
    db,
    rows.map((row) => row.id),
  );

  return PurchaseOrderDocumentListResultSchema.parse({
    items: rows.map((row) => {
      // Parsed through the metadata union `@pkg/schema` owns rather than read off a cast: a third
      // Purchase-Order document type would fail loudly here instead of quietly reading as neither.
      const metadata = PurchaseOrderDocumentMetadata.parse(row.metadata);

      return {
        byteSize: row.byteSize,
        contentType: row.contentType,
        createdAt: row.createdAt,
        filename: row.filename,
        id: row.id,
        revision: metadata.type === 'purchase_order' ? metadata.revision : null,
        settledReturnIds: settlements.get(row.id) ?? [],
        type: metadata.type,
        uploaderName: row.uploaderName,
      };
    }),
  });
}

/** Everything an order has sent back, and which of those a credit note has already answered. */
export async function listPurchaseOrderReturns({
  db,
  purchaseOrderId,
}: {
  db: Db;
  purchaseOrderId: UUID;
}): Promise<PurchaseOrderReturnListResult> {
  await getPurchaseOrder({ db, id: purchaseOrderId });
  const rows = await db
    .select({
      actorName: user.name,
      createdAt: stockMovements.createdAt,
      delta: stockMovements.delta,
      id: stockMovements.id,
      lengthMm: stockMovements.lengthMm,
      note: stockMovements.note,
      partCode: parts.code,
      partId: stockMovements.partId,
      partName: parts.name,
      reason: stockMovements.reason,
      settledByDocumentFilename: documents.filename,
      settledByDocumentId: documents.id,
      unitCost: stockMovements.unitCost,
    })
    .from(stockMovements)
    .innerJoin(parts, eq(parts.id, stockMovements.partId))
    .innerJoin(user, eq(user.id, stockMovements.actorUserId))
    .leftJoin(creditNoteSettlements, eq(creditNoteSettlements.stockMovementId, stockMovements.id))
    .leftJoin(documents, eq(documents.id, creditNoteSettlements.documentId))
    .where(
      and(eq(stockMovements.purchaseOrderId, purchaseOrderId), eq(stockMovements.movementType, 'return-to-supplier')),
    )
    .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));

  return PurchaseOrderReturnListResultSchema.parse({
    items: rows.map((row) => ({
      ...row,
      quantity: -row.delta,
      // Negative delta at a positive stamped cost: the value that came off the shelf, stated positive.
      value: row.unitCost === null ? null : -row.delta * row.unitCost,
    })),
  });
}

/**
 * Every return nobody has credited yet, plant-wide (spec §12) — procurement's chase list.
 *
 * Keyed on the absence of a settlement row, which is what makes it survive the multi-return order:
 * crediting one of three returns leaves the other two here, where an order-level flag would have
 * gone quiet after the first.
 */
export async function listReturnsAwaitingCredit({
  clock = () => new Date(),
  db,
}: {
  clock?: () => Date;
  db: Db;
}): Promise<ReturnsAwaitingCreditResult> {
  const today = toPlantDateOnly(clock());
  const rows = await db
    .select({
      createdAt: stockMovements.createdAt,
      delta: stockMovements.delta,
      id: stockMovements.id,
      partCode: parts.code,
      partId: stockMovements.partId,
      partName: parts.name,
      purchaseOrderCode: purchaseOrders.code,
      purchaseOrderId: purchaseOrders.id,
      reason: stockMovements.reason,
      supplierName: supplier.companyName,
      unitCost: stockMovements.unitCost,
    })
    .from(stockMovements)
    .innerJoin(parts, eq(parts.id, stockMovements.partId))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, stockMovements.purchaseOrderId))
    .innerJoin(supplier, eq(supplier.id, purchaseOrders.supplierId))
    .leftJoin(creditNoteSettlements, eq(creditNoteSettlements.stockMovementId, stockMovements.id))
    .where(and(eq(stockMovements.movementType, 'return-to-supplier'), isNull(creditNoteSettlements.stockMovementId)))
    // Longest uncredited first: the money that has been owed the longest leads the chase.
    .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));

  return ReturnsAwaitingCreditResultSchema.parse({
    items: rows.map((row) => ({
      ...row,
      daysOutstanding: diffDateOnlyDays(today, DateOnlyIso.parse(toPlantDateOnly(row.createdAt))),
      quantity: -row.delta,
      value: row.unitCost === null ? null : -row.delta * row.unitCost,
    })),
  });
}

async function loadSettlementsByDocument(db: Db, documentIds: readonly UUID[]): Promise<Map<string, UUID[]>> {
  if (documentIds.length === 0) return new Map();

  const rows = await db
    .select({
      documentId: creditNoteSettlements.documentId,
      stockMovementId: creditNoteSettlements.stockMovementId,
    })
    .from(creditNoteSettlements)
    .where(inArray(creditNoteSettlements.documentId, [...documentIds]));
  const byDocument = new Map<string, UUID[]>();

  for (const row of rows) {
    const settled = byDocument.get(row.documentId);
    if (settled) settled.push(row.stockMovementId);
    else byDocument.set(row.documentId, [row.stockMovementId]);
  }

  return byDocument;
}

/**
 * A credit note may only settle this order's own returns, and only ones nothing has credited yet.
 * Both are read under the ledger rows' own lock so two uploads racing the same return cannot both
 * think they are the first — the unique index is the backstop, this is the readable refusal.
 */
async function assertReturnsAreSettleable(tx: DatabaseTransaction, input: CreditNoteSettlementInput): Promise<void> {
  const returns = await tx
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(
      and(
        inArray(stockMovements.id, [...input.stockMovementIds]),
        eq(stockMovements.purchaseOrderId, input.purchaseOrderId),
        eq(stockMovements.movementType, 'return-to-supplier'),
      ),
    )
    .for('update');
  const found = new Set(returns.map((row) => row.id));
  const missing = input.stockMovementIds.find((id) => !found.has(id));
  if (missing) throw new CreditNoteReturnNotFoundError(missing);

  const [settled] = await tx
    .select({ stockMovementId: creditNoteSettlements.stockMovementId })
    .from(creditNoteSettlements)
    .where(inArray(creditNoteSettlements.stockMovementId, [...input.stockMovementIds]))
    .limit(1);
  if (settled) throw new CreditNoteAlreadySettledError(settled.stockMovementId);
}
