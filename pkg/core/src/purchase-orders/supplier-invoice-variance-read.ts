import type { Db } from '@pkg/db';
import type { InvoicePriceVarianceResult } from '@pkg/schema';
import { InvoicePriceVarianceResult as InvoicePriceVarianceResultSchema } from '@pkg/schema';

import {
  loadInvoiceDocuments,
  loadOrderHeaders,
  loadOrderLinesByOrder,
  loadResolutions,
  matchInvoiceRows,
} from './supplier-invoice-matching.js';

/**
 * Every line a Supplier billed at a price the order did not agree, plant-wide (spec §12).
 *
 * Read the same way the panel is — over stored extractions, matched fresh against current lines —
 * so a price somebody has since amended stops showing here without anything being rewritten.
 */
export async function listInvoicePriceVariance({ db }: { db: Db }): Promise<InvoicePriceVarianceResult> {
  const invoices = await loadInvoiceDocuments(db);
  if (invoices.length === 0) return { items: [] };

  const purchaseOrderIds = [...new Set(invoices.map((invoice) => invoice.purchaseOrderId))];
  const [linesByOrder, orders, resolutions] = await Promise.all([
    loadOrderLinesByOrder(db, purchaseOrderIds),
    loadOrderHeaders(db, purchaseOrderIds),
    loadResolutions(
      db,
      invoices.map((invoice) => invoice.documentId),
    ),
  ]);

  const items = invoices.flatMap((invoice) => {
    const order = orders.get(invoice.purchaseOrderId);
    const orderLines = linesByOrder.get(invoice.purchaseOrderId) ?? [];
    if (!invoice.extraction || !order) return [];

    const documentResolutions = resolutions.get(invoice.documentId);

    return matchInvoiceRows({
      extraction: invoice.extraction,
      orderLines,
      resolutions: documentResolutions,
    }).flatMap(({ answer, priceFlag, row }) => {
      if (!priceFlag || row.partId === null || row.invoiceUnitPrice === null || row.unitPrice === null) return [];

      // Strictly what the invoice printed. Falling back to the order's quantity would state a rand
      // exposure the Supplier never billed, and the list is ranked on exactly that number.
      const quantity = row.invoiceQuantity;

      return [
        {
          documentId: invoice.documentId,
          filename: invoice.filename,
          invoiceNumber: invoice.extraction?.invoiceNumber ?? null,
          invoiceUnitPrice: row.invoiceUnitPrice,
          partCode: row.partCode ?? '',
          partId: row.partId,
          partName: row.partName ?? '',
          purchaseOrderCode: order.code,
          purchaseOrderId: order.id,
          quantity,
          resolution: answer?.kind ?? null,
          supplierName: order.supplierName,
          unitPrice: row.unitPrice,
          varianceValue: quantity === null ? null : (row.invoiceUnitPrice - row.unitPrice) * quantity,
        },
      ];
    });
  });

  return InvoicePriceVarianceResultSchema.parse({
    // Biggest disagreement first — the money worth arguing about leads the list — with the document
    // and Part breaking a tie, so two identical variances do not swap places between reads.
    items: items.sort(
      (a, b) =>
        Math.abs(b.varianceValue ?? 0) - Math.abs(a.varianceValue ?? 0) ||
        a.documentId.localeCompare(b.documentId) ||
        a.partCode.localeCompare(b.partCode),
    ),
  });
}
