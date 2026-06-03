import type { customers, Db, products, quotes, user } from '@pkg/db';
import {
  computeQuoteTotal,
  formatCurrency,
  formatPercent,
  QUOTE_DOCUMENT_VAT_PERCENT,
  resolveEffectiveBom,
} from '@pkg/domain';
import {
  formatQuoteCode,
  type QuoteDocumentGenerationInput,
  type QuoteDocumentLineItem,
  type QuoteDocumentModel,
} from '@pkg/schema';

import { listAssemblies } from '../products/product-assembly-service.js';
import type { QuoteSelectedAssemblyRow } from './quote-selected-assemblies.js';

export type QuoteDocumentGenerationRow = typeof quotes.$inferSelect & {
  customer: Pick<
    typeof customers.$inferSelect,
    'address' | 'companyName' | 'contactPerson' | 'email' | 'phone' | 'vatNumber'
  >;
  product: Pick<typeof products.$inferSelect, 'buildTimeDays' | 'currencyCode' | 'modelCode' | 'name'>;
  salesPerson: Pick<typeof user.$inferSelect, 'email' | 'name'> | null;
  selectedAssemblies: QuoteSelectedAssemblyRow[];
};

export type { QuoteDocumentLineItem, QuoteDocumentModel };

export async function getQuoteDocumentModel({
  db,
  input,
  quote,
}: {
  db: Db;
  input: QuoteDocumentGenerationInput;
  quote: QuoteDocumentGenerationRow;
}): Promise<QuoteDocumentModel> {
  const productAssemblies = await listAssemblies({ productId: quote.productId, tx: db });
  const effectiveBom = resolveEffectiveBom({
    catalogAssemblies: productAssemblies,
    selectedAssemblies: quote.selectedAssemblies,
  });
  const selectedOptionalAssemblies = effectiveBom.selectedOptionalAssemblies.map(({ selection }) => ({
    amount: selection.quotedPrice,
    label: selection.quotedName,
  }));
  const lineItems: QuoteDocumentLineItem[] = [
    {
      amount: quote.quotedBasePrice,
      descriptionLines: [`${quote.product.modelCode} ${quote.product.name}`.trim()],
      kind: 'base',
      quantity: 1,
    },
    ...selectedOptionalAssemblies.map((item) => ({
      amount: item.amount,
      descriptionLines: [item.label],
      kind: 'optional' as const,
      quantity: 1,
    })),
    ...(quote.deliveryIncluded && quote.deliveryPrice > 0
      ? [
          {
            amount: quote.deliveryPrice,
            descriptionLines: ['Delivery'],
            kind: 'charge' as const,
            quantity: 1,
          },
        ]
      : []),
    ...(quote.discountAmount > 0
      ? [
          {
            amount: -quote.discountAmount,
            descriptionLines: ['Discount'],
            kind: 'discount' as const,
            quantity: 1,
          },
        ]
      : []),
  ];
  const subtotal = computeQuoteTotal({
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discountAmount: quote.discountAmount,
    quotedBasePrice: quote.quotedBasePrice,
    selectedAssemblyPrices: selectedOptionalAssemblies.map((item) => item.amount),
  });
  const vatAmount = (subtotal * QUOTE_DOCUMENT_VAT_PERCENT) / 100;

  return {
    customer: quote.customer,
    issueDate: quote.createdAt,
    leadTime: input.leadTime,
    lineItems,
    notes: toDisplayLines(quote.documentNotes),
    paymentTerms: `${formatPercent(quote.depositPercent)} deposit`,
    quoteCode: formatQuoteCode(quote.code),
    salesPerson: quote.salesPerson,
    staleSelectionNotes: effectiveBom.staleSelections.map((selection) => `${selection.quotedName} unavailable`),
    subtotal,
    total: subtotal + vatAmount,
    transport: quote.deliveryIncluded
      ? `Included${quote.deliveryPrice > 0 ? ` (${formatCurrency(quote.deliveryPrice, quote.product.currencyCode)})` : ''}`
      : 'Excluded',
    vatAmount,
    currencyCode: quote.product.currencyCode,
  };
}

function toDisplayLines(value: string | null | undefined): string[] {
  return value
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}
