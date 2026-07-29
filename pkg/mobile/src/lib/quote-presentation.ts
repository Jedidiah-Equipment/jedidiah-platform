import { quoteStatusLabels, toQuoteWorkItemFormState } from '@pkg/domain';
import {
  AuthId,
  DateIsoString,
  DateOnlyIsoString,
  Department,
  getQuoteDeliveryPricingError,
  Price,
  QuoteCancellationReason,
  QuoteDepositPercent,
  type QuoteDetail,
  QuoteDiscountPercent,
  QuoteDocumentNotes,
  QuoteInvoiceNumber,
  type QuoteKind,
  QuoteNotes,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
  type QuoteSummary,
  QuoteUpdateInput,
  QuoteWorkItemHourlyRate,
  QuoteWorkItemHours,
  type QuoteWorkItemInput,
  QuoteWorkItemName,
  QuoteWorkItemPartName,
  QuoteWorkItemPartQuantity,
  QuoteWorkTitle,
  type UUID,
} from '@pkg/schema';
import { z } from 'zod';

export type QuoteStatusFilter = 'all' | QuoteSummary['status'];
export type QuoteSort = 'newest' | 'oldest';

export const QUOTE_STATUS_OPTIONS = QuoteStatus.options.map((status) => ({
  label: quoteStatusLabels[status],
  value: status,
}));

export function parseQuoteCancellationReason(value: string): string | null {
  const result = QuoteCancellationReason.safeParse(value);
  return result.success ? result.data : null;
}

export function isQuoteStatusFilter(value: unknown): value is QuoteStatusFilter {
  return value === 'all' || QuoteStatus.safeParse(value).success;
}

export function isQuoteSort(value: unknown): value is QuoteSort {
  return value === 'newest' || value === 'oldest';
}

export function quoteSortDirection(sort: QuoteSort): 'asc' | 'desc' {
  return sort === 'newest' ? 'desc' : 'asc';
}

/** Pinning atop an explicitly re-sorted list would contradict the user's chosen order. */
export function shouldPinPriorityQuotes({
  search,
  sort,
  status,
}: {
  search: string;
  sort: QuoteSort;
  status: QuoteStatusFilter;
}): boolean {
  return search.trim().length === 0 && status === 'all' && sort === 'newest';
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

/** The picker's fourth option. A Work Item with no Department is the only shape that carries a name. */
export const OTHER_WORK_ITEM_DEPARTMENT = 'other';

const WorkItemDepartmentSelection = z.union([Department, z.literal(OTHER_WORK_ITEM_DEPARTMENT)]);

/**
 * Browser shape for a Work Item: nullable `name` and `description` collapse to `''` for controlled
 * inputs, and a name is required only for the department-less "Other" item.
 */
const QuoteWorkItemFormInput = z
  .object({
    department: WorkItemDepartmentSelection,
    description: z.string(),
    hourlyRate: QuoteWorkItemHourlyRate,
    hours: QuoteWorkItemHours,
    name: z.string(),
    parts: z.array(z.object({ name: QuoteWorkItemPartName, quantity: QuoteWorkItemPartQuantity, unitPrice: Price })),
  })
  .superRefine((value, context) => {
    if (value.department === OTHER_WORK_ITEM_DEPARTMENT && !QuoteWorkItemName.safeParse(value.name).success) {
      context.addIssue({ code: 'custom', message: 'Work item name is required', path: ['name'] });
    }
  });

export type QuoteEditFormValues = z.infer<typeof QuoteEditFormValues>;
export const QuoteEditFormValues = z
  .object({
    cancellationReason: z.string(),
    deliveryIncluded: z.boolean(),
    deliveryPrice: Price,
    depositPercent: QuoteDepositPercent,
    discountPercent: QuoteDiscountPercent,
    documentNotes: z.string(),
    invoiceNumber: z.string(),
    notes: z.string(),
    plannedDeliveryDate: z.union([z.literal(''), DateOnlyIsoString]),
    preferredDeliveryDate: z.union([z.literal(''), DateOnlyIsoString]),
    salesPersonId: AuthId,
    selectedAssemblies: z.array(QuoteSelectedAssemblyInput),
    status: QuoteStatus,
    validUntil: z.union([z.literal(''), DateIsoString]),
    workTitle: z.string(),
    workItems: z.array(QuoteWorkItemFormInput),
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

    if (values.status === 'cancelled') {
      const result = QuoteCancellationReason.safeParse(values.cancellationReason);
      if (!result.success) {
        context.addIssue({
          code: 'custom',
          message: result.error.issues[0]?.message ?? 'Cancellation reason is required',
          path: ['cancellationReason'],
        });
      }
    }

    for (const [field, schema] of [
      ['notes', QuoteNotes],
      ['documentNotes', QuoteDocumentNotes],
      ['invoiceNumber', QuoteInvoiceNumber],
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
    cancellationReason: quote.cancellationReason ?? '',
    workItems: toQuoteWorkItemFormState(quote).workItems.map((workItem) => ({
      ...workItem,
      department: workItem.department ?? OTHER_WORK_ITEM_DEPARTMENT,
      description: workItem.description ?? '',
      name: workItem.name ?? '',
    })),
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    depositPercent: quote.depositPercent,
    discountPercent: quote.discountPercent,
    documentNotes: quote.documentNotes ?? '',
    invoiceNumber: quote.invoiceNumber ?? '',
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

/**
 * Browser shape → API. A Work Item with a Department stores no name — it is labelled by the
 * Department — so the browser's `''` placeholder never reaches the server as an empty string.
 */
export function toQuoteWorkItemInput(workItem: QuoteEditFormValues['workItems'][number]): QuoteWorkItemInput {
  return workItem.department === OTHER_WORK_ITEM_DEPARTMENT
    ? {
        department: null,
        description: workItem.description || null,
        hourlyRate: workItem.hourlyRate,
        hours: workItem.hours,
        name: workItem.name,
        parts: workItem.parts,
      }
    : {
        department: workItem.department,
        description: workItem.description || null,
        hourlyRate: workItem.hourlyRate,
        hours: workItem.hours,
        name: null,
        parts: workItem.parts,
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
    cancellationReason: values.status === 'cancelled' ? values.cancellationReason : null,
    id,
    offering:
      kind === 'product'
        ? { kind: 'product' }
        : {
            kind: 'custom',
            workItems: values.workItems.map(toQuoteWorkItemInput),
            workTitle: values.workTitle,
          },
    deliveryIncluded: values.deliveryIncluded,
    deliveryPrice: values.deliveryIncluded ? 0 : values.deliveryPrice,
    depositPercent: values.depositPercent,
    discountPercent: values.discountPercent,
    documentNotes: values.documentNotes,
    invoiceNumber: values.invoiceNumber,
    notes: values.notes,
    plannedDeliveryDate: values.plannedDeliveryDate || null,
    preferredDeliveryDate: values.preferredDeliveryDate || null,
    salesPersonId: values.salesPersonId,
    selectedAssemblies: kind === 'product' ? values.selectedAssemblies : [],
    status: values.status,
    validUntil: values.validUntil || null,
  });
}
