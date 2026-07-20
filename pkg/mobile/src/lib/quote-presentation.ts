import { computeAdditionalDeliveryPrice, priceQuoteWithCatalog } from '@pkg/domain';
import {
  type Assembly,
  AuthId,
  DateIsoString,
  DateOnlyIsoString,
  getQuoteDeliveryPricingError,
  Price,
  QuoteDepositPercent,
  type QuoteDetail,
  QuoteDiscountPercent,
  QuoteDocumentNotes,
  type QuoteKind,
  QuoteLineItemName,
  QuoteLineItemQuantity,
  QuoteNotes,
  type QuoteSelectedAssembly,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
  type QuoteSummary,
  QuoteUpdateInput,
  QuoteWorkTitle,
  type UUID,
} from '@pkg/schema';
import { z } from 'zod';

export type QuoteStatusFilter = 'all' | QuoteSummary['status'];

export const quoteStatusLabels = {
  accepted: 'Accepted',
  cancelled: 'Cancelled',
  draft: 'Draft',
  rejected: 'Rejected',
  sent: 'Sent',
} as const satisfies Record<QuoteSummary['status'], string>;

export const quoteStatusColorClassNames = {
  accepted: { chip: 'border-emerald-500/50 bg-emerald-500/15', text: 'text-emerald-800 dark:text-emerald-200' },
  cancelled: { chip: 'border-orange-500/50 bg-orange-500/15', text: 'text-orange-800 dark:text-orange-200' },
  draft: { chip: 'border-gray-400/50 bg-gray-500/10', text: 'text-gray-700 dark:text-gray-200' },
  rejected: { chip: 'border-red-500/50 bg-red-500/15', text: 'text-red-800 dark:text-red-200' },
  sent: { chip: 'border-blue-500/50 bg-blue-500/15', text: 'text-blue-800 dark:text-blue-200' },
} as const satisfies Record<QuoteSummary['status'], { chip: string; text: string }>;

export function isQuoteStatusFilter(value: unknown): value is QuoteStatusFilter {
  return value === 'all' || QuoteStatus.safeParse(value).success;
}

export function shouldPinPriorityQuotes({ search, status }: { search: string; status: QuoteStatusFilter }): boolean {
  return search.trim().length === 0 && status === 'all';
}

type QuoteMetaFacts =
  | { kind: 'custom' }
  | {
      kind: 'product';
      product: Pick<NonNullable<QuoteSummary['product']>, 'buildTimeDays' | 'modelCode'>;
      selectedAssemblies: readonly { productAssemblyId: string | null }[];
    };

export function quoteMetaLine(quote: QuoteMetaFacts): string {
  if (quote.kind === 'custom') return 'Custom work';

  const liveOptionCount = quote.selectedAssemblies.filter((selection) => selection.productAssemblyId !== null).length;
  const optionSuffix = liveOptionCount === 0 ? '' : ` · ${liveOptionCount} option${liveOptionCount === 1 ? '' : 's'}`;

  return `${quote.product.modelCode} · ${quote.product.buildTimeDays} days${optionSuffix}`;
}

type QuotePage<T> = { items: readonly T[] };

export function presentQuotePages<T extends { id: string }>(
  pages: readonly QuotePage<T>[],
  priorityQuotes: readonly T[],
): { priorityQuotes: T[]; mainQuotes: T[] } {
  const priorityIds = new Set(priorityQuotes.map((quote) => quote.id));
  const mainQuotes = pages.flatMap((page) => page.items).filter((quote) => !priorityIds.has(quote.id));

  return { priorityQuotes: [...priorityQuotes], mainQuotes };
}

export function getNextQuotePage<T>(
  lastPage: QuotePage<T> & { total: number },
  pages: readonly QuotePage<T>[],
): number | undefined {
  const loaded = pages.reduce((count, page) => count + page.items.length, 0);

  return loaded < lastPage.total ? pages.length + 1 : undefined;
}

const QuoteEditLineItem = z.object({
  name: QuoteLineItemName,
  quantity: QuoteLineItemQuantity,
  unitPrice: Price,
});

export type QuoteEditFormValues = z.infer<typeof QuoteEditFormValues>;
export const QuoteEditFormValues = z
  .object({
    basePrice: Price,
    deliveryIncluded: z.boolean(),
    deliveryPrice: Price,
    depositPercent: QuoteDepositPercent,
    discountPercent: QuoteDiscountPercent,
    documentNotes: z.string(),
    lineItems: z.array(QuoteEditLineItem),
    notes: z.string(),
    plannedDeliveryDate: z.union([z.literal(''), DateOnlyIsoString]),
    preferredDeliveryDate: z.union([z.literal(''), DateOnlyIsoString]),
    salesPersonId: AuthId,
    selectedAssemblies: z.array(QuoteSelectedAssemblyInput),
    status: QuoteStatus,
    validUntil: z.union([z.literal(''), DateIsoString]),
    workTitle: z.string(),
  })
  .strict();

export function getQuoteEditFormValuesValidator(kind: QuoteKind) {
  return QuoteEditFormValues.superRefine((values, context) => {
    const deliveryPricingError = getQuoteDeliveryPricingError(values);
    if (deliveryPricingError) {
      context.addIssue({ code: 'custom', message: deliveryPricingError, path: ['deliveryPrice'] });
    }

    if (kind === 'custom' && !QuoteWorkTitle.safeParse(values.workTitle).success) {
      context.addIssue({ code: 'custom', message: 'Work title is required', path: ['workTitle'] });
    }

    for (const [field, schema] of [
      ['notes', QuoteNotes],
      ['documentNotes', QuoteDocumentNotes],
    ] as const) {
      if (values[field] === '') continue;

      const result = schema.safeParse(values[field]);
      if (!result.success) {
        context.addIssue({ code: 'custom', message: result.error.issues[0]?.message, path: [field] });
      }
    }
  });
}

export function toQuoteEditFormValues(quote: QuoteDetail): QuoteEditFormValues {
  return {
    basePrice: quote.quotedBasePrice,
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    depositPercent: quote.depositPercent,
    discountPercent: quote.discountPercent,
    documentNotes: quote.documentNotes ?? '',
    lineItems: quote.lineItems.map(({ name, quantity, unitPrice }) => ({ name, quantity, unitPrice })),
    notes: quote.notes ?? '',
    plannedDeliveryDate: quote.plannedDeliveryDate ?? '',
    preferredDeliveryDate: quote.preferredDeliveryDate ?? '',
    salesPersonId: quote.salesPersonId,
    selectedAssemblies: quote.selectedAssemblies.map((selection) => ({ type: 'existing', id: selection.id })),
    status: quote.status,
    validUntil: quote.validUntil ?? '',
    workTitle: quote.workTitle ?? '',
  };
}

export function toQuoteUpdateInput({
  id,
  kind,
  values,
}: {
  id: UUID;
  kind: QuoteKind;
  values: QuoteEditFormValues;
}): QuoteUpdateInput {
  return QuoteUpdateInput.parse({
    id,
    offering:
      kind === 'product'
        ? { kind: 'product' }
        : { kind: 'custom', basePrice: values.basePrice, workTitle: values.workTitle },
    deliveryIncluded: values.deliveryIncluded,
    deliveryPrice: values.deliveryIncluded ? 0 : values.deliveryPrice,
    depositPercent: values.depositPercent,
    discountPercent: values.discountPercent,
    documentNotes: values.documentNotes,
    lineItems: values.lineItems,
    notes: values.notes,
    plannedDeliveryDate: values.plannedDeliveryDate || null,
    preferredDeliveryDate: values.preferredDeliveryDate || null,
    salesPersonId: values.salesPersonId,
    selectedAssemblies: kind === 'product' ? values.selectedAssemblies : [],
    status: values.status,
    validUntil: values.validUntil || null,
  });
}

export type SelectedAssemblySnapshot = Pick<
  QuoteSelectedAssembly,
  'id' | 'productAssemblyId' | 'quotedName' | 'quotedPrice'
>;

export type QuoteComputedSummary = {
  basePrice: number;
  currencyCode: string;
  deliveryIncluded: boolean;
  deliveryPrice: number;
  discountAmount: number;
  discountPercent: number;
  lineItems: QuoteEditFormValues['lineItems'];
  lineItemTotal: number;
  selectedAssemblies: SelectedAssemblySnapshot[];
  selectedAssemblyTotal: number;
  subtotal: number;
  total: number;
  vatAmount: number;
  vatPercent: number;
};

export function computeQuoteSummary({
  quote,
  values,
}: {
  quote: QuoteDetail;
  values: QuoteEditFormValues;
}): QuoteComputedSummary {
  const catalogAssemblies = quote.product?.assemblies ?? [];
  const deliveryPrice = computeAdditionalDeliveryPrice(values);
  const basePrice = quote.kind === 'custom' ? values.basePrice : quote.quotedBasePrice;
  const selectedAssemblies =
    quote.kind === 'custom'
      ? []
      : resolveSelectedAssemblySnapshots({
          catalogAssemblies,
          formSelections: values.selectedAssemblies,
          initialSelections: quote.selectedAssemblies,
        });
  const pricing = priceQuoteWithCatalog(
    {
      deliveryIncluded: values.deliveryIncluded,
      deliveryPrice,
      discountPercent: values.discountPercent,
      lineItems: values.lineItems,
      quotedBasePrice: basePrice,
      selectedAssemblies,
    },
    catalogAssemblies,
  );

  return {
    basePrice,
    currencyCode: quote.product?.currencyCode ?? quote.quotedCurrencyCode,
    deliveryIncluded: values.deliveryIncluded,
    deliveryPrice,
    discountAmount: pricing.discountAmount,
    discountPercent: values.discountPercent,
    lineItems: values.lineItems,
    lineItemTotal: pricing.lineItemTotal,
    selectedAssemblies: [...pricing.liveSelections],
    selectedAssemblyTotal: pricing.selectedAssemblyTotal,
    subtotal: pricing.subtotal,
    total: pricing.total,
    vatAmount: pricing.vatAmount,
    vatPercent: pricing.vatPercent,
  };
}

export function resolveSelectedAssemblySnapshots({
  catalogAssemblies,
  formSelections,
  initialSelections,
}: {
  catalogAssemblies: readonly Assembly[];
  formSelections: QuoteEditFormValues['selectedAssemblies'];
  initialSelections: readonly QuoteSelectedAssembly[];
}): SelectedAssemblySnapshot[] {
  return formSelections
    .map((selection): SelectedAssemblySnapshot | null => {
      if (selection.type === 'existing') {
        return initialSelections.find((item) => item.id === selection.id) ?? null;
      }

      const assembly = catalogAssemblies.find(
        (item) => item.id === selection.productAssemblyId && item.kind === 'optional',
      );
      if (assembly?.kind !== 'optional') return null;

      return {
        id: assembly.id,
        productAssemblyId: assembly.id,
        quotedName: assembly.name,
        quotedPrice: assembly.price,
      };
    })
    .filter((selection): selection is SelectedAssemblySnapshot => selection !== null);
}
