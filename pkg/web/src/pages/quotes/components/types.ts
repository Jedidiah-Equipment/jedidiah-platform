import { computeAdditionalDeliveryPrice, priceQuoteFromLiveSelections, resolveEffectiveBom } from '@pkg/domain';
import {
  type Assembly,
  AuthId,
  CustomerCompanyName,
  DateIsoString,
  DateOnlyIsoString,
  getQuoteDeliveryPricingError,
  Price,
  QuoteCreateInput,
  QuoteDepositPercent,
  type QuoteDetail,
  QuoteDiscountPercent,
  QuoteDocumentNotes,
  QuoteKind,
  type QuoteLineItem,
  QuoteLineItemName,
  QuoteLineItemQuantity,
  QuoteNotes,
  type QuoteProductBayAvailabilityResult,
  type QuoteSelectedAssembly,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
  QuoteUpdateInput,
  QuoteWorkTitle,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr, requiredSelection } from '@/components/form/utils/form-schema.js';

export const CustomerMode = z.enum(['existing', 'inline']);

const QuoteLineItemFormInput = z.object({
  name: QuoteLineItemName,
  quantity: QuoteLineItemQuantity,
  unitPrice: Price,
});

const QuoteCreateBasePrice = z.union([Price, z.nan()]);

const QuoteCreateFormValuesShape = z.object({
  customerId: z.string(),
  customerMode: CustomerMode,
  basePrice: QuoteCreateBasePrice,
  inlineCompanyName: z.string(),
  kind: QuoteKind,
  productId: z.string(),
  rangeId: emptyStringOr(UUID),
  salesPersonId: requiredSelection(AuthId, 'Select a salesperson'),
  status: QuoteStatus,
  workTitle: z.string(),
});
type QuoteCreateFormSelectionValues = z.infer<typeof QuoteCreateFormValuesShape>;
export const QuoteCreateFormValues =
  QuoteCreateFormValuesShape.superRefine(refineQuoteCustomerSelection).superRefine(refineQuoteOfferingSelection);
export type QuoteCreateFormValues = z.infer<typeof QuoteCreateFormValues>;

export type QuoteFormValues = z.infer<typeof QuoteFormValues>;
export const QuoteFormValues = z
  .object({
    depositPercent: QuoteDepositPercent,
    deliveryIncluded: z.boolean(),
    deliveryPrice: Price,
    discountPercent: QuoteDiscountPercent,
    basePrice: Price,
    notes: emptyStringOr(QuoteNotes),
    documentNotes: emptyStringOr(QuoteDocumentNotes),
    lineItems: z.array(QuoteLineItemFormInput),
    plannedDeliveryDate: emptyStringOr(DateOnlyIsoString),
    preferredDeliveryDate: emptyStringOr(DateOnlyIsoString),
    salesPersonId: requiredSelection(AuthId, 'Select a salesperson'),
    selectedAssemblies: z.array(QuoteSelectedAssemblyInput),
    status: QuoteStatus,
    validUntil: emptyStringOr(DateIsoString),
    workTitle: z.string(),
  })
  .strict();

export function getQuoteFormValuesValidator(kind: QuoteKind) {
  return QuoteFormValues.superRefine((value, context) => {
    const deliveryPricingError = getQuoteDeliveryPricingError(value);

    if (deliveryPricingError) {
      context.addIssue({
        code: 'custom',
        message: deliveryPricingError,
        path: ['deliveryPrice'],
      });
    }

    if (kind === 'custom' && !QuoteWorkTitle.safeParse(value.workTitle).success) {
      context.addIssue({
        code: 'custom',
        message: 'Work title is required',
        path: ['workTitle'],
      });
    }
  });
}

export const emptyQuoteFormValues: QuoteFormValues = {
  depositPercent: 0,
  deliveryIncluded: true,
  deliveryPrice: 0,
  discountPercent: 0,
  basePrice: 0,
  notes: '',
  documentNotes: '',
  lineItems: [],
  plannedDeliveryDate: '',
  preferredDeliveryDate: '',
  salesPersonId: '',
  selectedAssemblies: [],
  status: 'draft',
  validUntil: '',
  workTitle: '',
};

export const QUOTE_CREATE_DEFAULT_VALUES: QuoteCreateFormValues = {
  basePrice: 0,
  customerId: '',
  customerMode: 'existing',
  inlineCompanyName: '',
  kind: 'product',
  productId: '',
  rangeId: '',
  salesPersonId: '',
  status: 'draft',
  workTitle: '',
};

export type QuoteComputedSummary = {
  currencyCode: string;
  deliveryIncluded: boolean;
  deliveryPrice: number;
  discountAmount: number;
  discountPercent: number;
  lineItems: QuoteFormValues['lineItems'];
  lineItemTotal: number;
  basePrice: number;
  selectedAssemblies: SelectedAssemblySnapshot[];
  selectedAssemblyTotal: number;
  total: number;
};

export function computeQuoteSummary({
  quote,
  values,
}: {
  quote: QuoteDetail;
  values: QuoteFormValues;
}): QuoteComputedSummary {
  const catalogAssemblies = quote.product?.assemblies ?? [];
  const currencyCode = quote.product?.currencyCode ?? quote.quotedCurrencyCode;
  const deliveryPrice = computeAdditionalDeliveryPrice(values);
  const quotedBasePrice = quote.kind === 'custom' ? values.basePrice : quote.quotedBasePrice;
  const selectedSnapshots =
    quote.kind === 'custom'
      ? []
      : resolveSelectedAssemblySnapshots({
          catalogAssemblies,
          formSelections: values.selectedAssemblies,
          initialSelections: quote.selectedAssemblies,
        });
  // Exclude stale selections from the on-screen pricing preview so the figure reflects only
  // assemblies still present in the freshly loaded Product catalog.
  const { staleSelections } = resolveEffectiveBom({
    catalogAssemblies,
    selectedAssemblies: selectedSnapshots,
  });
  const staleSnapshots = new Set(staleSelections);
  const selectedAssemblies = selectedSnapshots.filter((snapshot) => !staleSnapshots.has(snapshot));
  const pricing = priceQuoteFromLiveSelections(
    {
      deliveryIncluded: values.deliveryIncluded,
      deliveryPrice,
      discountPercent: values.discountPercent,
      lineItems: values.lineItems,
      quotedBasePrice,
    },
    selectedAssemblies,
  );

  return {
    deliveryIncluded: values.deliveryIncluded,
    deliveryPrice,
    discountAmount: pricing.discountAmount,
    discountPercent: values.discountPercent,
    basePrice: quotedBasePrice,
    currencyCode,
    lineItems: values.lineItems,
    lineItemTotal: pricing.lineItemTotal,
    selectedAssemblies,
    selectedAssemblyTotal: pricing.selectedAssemblyTotal,
    total: pricing.total,
  };
}

/**
 * Schema → form. Builds the browser form state from an existing quote. Nullable schema fields
 * collapse to `''` for controlled inputs.
 */
export function toQuoteFormValues(initialQuote: QuoteDetail): QuoteFormValues {
  return {
    basePrice: initialQuote.quotedBasePrice,
    depositPercent: initialQuote.depositPercent,
    deliveryIncluded: initialQuote.deliveryIncluded,
    deliveryPrice: initialQuote.deliveryPrice,
    discountPercent: initialQuote.discountPercent,
    notes: initialQuote.notes ?? '',
    documentNotes: initialQuote.documentNotes ?? '',
    lineItems: initialQuote.lineItems.map(toQuoteLineItemInput),
    plannedDeliveryDate: initialQuote.plannedDeliveryDate ?? '',
    preferredDeliveryDate: initialQuote.preferredDeliveryDate ?? '',
    salesPersonId: initialQuote.salesPersonId,
    selectedAssemblies: initialQuote.selectedAssemblies.map(
      (selection): QuoteSelectedAssemblyInput => ({ type: 'existing', id: selection.id }),
    ),
    status: initialQuote.status,
    validUntil: initialQuote.validUntil ?? '',
    workTitle: initialQuote.workTitle ?? '',
  };
}

/**
 * Form → schema. Assembles the API request from form state: the customer discriminated union
 * from the mode flags. The create-only Range filter is intentionally ignored because Quotes only
 * persist the selected Product. Parsing through `QuoteCreateInput` applies the schema defaults for
 * every full-edit field that is intentionally absent from the create modal.
 */
export function toQuoteCreateInput(value: QuoteCreateFormValues): QuoteCreateInput {
  return QuoteCreateInput.parse({
    customer:
      value.customerMode === 'existing'
        ? { type: 'existing', customerId: value.customerId }
        : { type: 'inline', companyName: value.inlineCompanyName },
    offering:
      value.kind === 'product'
        ? { kind: 'product', productId: value.productId }
        : { kind: 'custom', basePrice: value.basePrice, workTitle: value.workTitle },
    salesPersonId: value.salesPersonId,
    status: value.status,
  });
}

export function toQuoteUpdateInput({
  id,
  kind,
  value,
}: {
  id: UUID;
  kind: QuoteKind;
  value: QuoteFormValues;
}): QuoteUpdateInput {
  return QuoteUpdateInput.parse({
    id,
    offering:
      kind === 'product'
        ? { kind: 'product' }
        : { kind: 'custom', basePrice: value.basePrice, workTitle: value.workTitle },
    deliveryIncluded: value.deliveryIncluded,
    deliveryPrice: computeAdditionalDeliveryPrice(value),
    depositPercent: value.depositPercent,
    discountPercent: value.discountPercent,
    notes: value.notes,
    documentNotes: value.documentNotes,
    lineItems: value.lineItems,
    plannedDeliveryDate: value.plannedDeliveryDate || null,
    preferredDeliveryDate: value.preferredDeliveryDate || null,
    salesPersonId: value.salesPersonId,
    selectedAssemblies: value.selectedAssemblies,
    status: value.status,
    validUntil: value.validUntil || null,
  });
}

function toQuoteLineItemInput(lineItem: QuoteLineItem): z.infer<typeof QuoteLineItemFormInput> {
  return {
    name: lineItem.name,
    quantity: lineItem.quantity,
    unitPrice: lineItem.unitPrice,
  };
}

function refineQuoteCustomerSelection(
  value: Pick<QuoteCreateFormSelectionValues, 'customerId' | 'customerMode' | 'inlineCompanyName'>,
  context: z.RefinementCtx,
) {
  if (value.customerMode === 'existing' && !UUID.safeParse(value.customerId).success) {
    context.addIssue({
      code: 'custom',
      message: 'Select a customer',
      path: ['customerId'],
    });
  }

  if (value.customerMode === 'inline' && !CustomerCompanyName.safeParse(value.inlineCompanyName).success) {
    context.addIssue({
      code: 'custom',
      message: 'Company name is required',
      path: ['inlineCompanyName'],
    });
  }
}

function refineQuoteOfferingSelection(
  value: Pick<QuoteCreateFormSelectionValues, 'basePrice' | 'kind' | 'productId' | 'workTitle'>,
  context: z.RefinementCtx,
) {
  if (value.kind === 'product' && !UUID.safeParse(value.productId).success) {
    context.addIssue({
      code: 'custom',
      message: 'Select a product',
      path: ['productId'],
    });
  }

  if (value.kind === 'custom' && !QuoteWorkTitle.safeParse(value.workTitle).success) {
    context.addIssue({
      code: 'custom',
      message: 'Work title is required',
      path: ['workTitle'],
    });
  }

  if (value.kind === 'custom' && !Price.safeParse(value.basePrice).success) {
    context.addIssue({
      code: 'custom',
      message: 'Base price is required',
      path: ['basePrice'],
    });
  }
}

export function getDefaultQuoteDocumentLeadTime(quote: Pick<QuoteDetail, 'product'>): string {
  return quote.product === null ? '' : formatQuoteDocumentLeadTime(quote.product.buildTimeDays);
}

export function formatQuoteDocumentLeadTime(days: number): string {
  return `${days} working days`;
}

export function getDefaultQuoteDocumentLeadTimeFromAvailability(
  availability: Pick<QuoteProductBayAvailabilityResult, 'defaultLeadTimeWorkingDays'>,
): string {
  return formatQuoteDocumentLeadTime(availability.defaultLeadTimeWorkingDays);
}

export function resolveQuoteDocumentLeadTime({
  availability,
  fallbackLeadTime,
  hasUserEditedLeadTime,
  leadTime,
}: {
  availability: Pick<QuoteProductBayAvailabilityResult, 'defaultLeadTimeWorkingDays'> | null | undefined;
  fallbackLeadTime: string;
  hasUserEditedLeadTime: boolean;
  leadTime: string;
}): string {
  if (hasUserEditedLeadTime) {
    return leadTime;
  }

  return availability ? getDefaultQuoteDocumentLeadTimeFromAvailability(availability) : fallbackLeadTime;
}

export type SelectedAssemblySnapshot = {
  id: UUID;
  productAssemblyId: UUID | null;
  quotedName: string;
  quotedPrice: number;
};

/**
 * Resolves the form's assembly selections against the product catalog and the quote's existing
 * selections into display snapshots, dropping selections that no longer resolve.
 */
export function resolveSelectedAssemblySnapshots({
  catalogAssemblies,
  formSelections,
  initialSelections,
}: {
  catalogAssemblies: Assembly[];
  formSelections: QuoteFormValues['selectedAssemblies'];
  initialSelections: QuoteSelectedAssembly[];
}): SelectedAssemblySnapshot[] {
  return formSelections
    .map((selection): SelectedAssemblySnapshot | null => {
      if (selection.type === 'existing') {
        return initialSelections.find((item) => item.id === selection.id) ?? null;
      }

      const assembly = catalogAssemblies.find(
        (item) => item.id === selection.productAssemblyId && item.kind === 'optional',
      );

      if (assembly?.kind !== 'optional') {
        return null;
      }

      return {
        id: selection.productAssemblyId,
        productAssemblyId: assembly.id,
        quotedName: assembly.name,
        quotedPrice: assembly.price,
      };
    })
    .filter((selection): selection is SelectedAssemblySnapshot => Boolean(selection));
}
