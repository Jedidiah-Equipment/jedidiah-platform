import { computeAdditionalDeliveryPrice, DEFAULT_CUSTOM_HOURLY_RATE, toQuoteWorkItemFormState } from '@pkg/domain';
import {
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
  QuoteHourlyRate,
  QuoteKind,
  QuoteNotes,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
  QuoteUpdateInput,
  QuoteWorkItemFormValue,
  QuoteWorkTitle,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr, requiredSelection } from '@/components/form/utils/form-schema.js';

export const CustomerMode = z.enum(['existing', 'inline']);

const QuoteCreateBasePrice = z.union([Price, z.nan()]);
const QuoteCreateHourlyRate = z.union([QuoteHourlyRate, z.nan()]);

const QuoteCreateFormValuesShape = z.object({
  customerId: z.string(),
  customerMode: CustomerMode,
  basePrice: QuoteCreateBasePrice,
  hourlyRate: QuoteCreateHourlyRate,
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
    hourlyRate: QuoteHourlyRate,
    notes: emptyStringOr(QuoteNotes),
    documentNotes: emptyStringOr(QuoteDocumentNotes),
    plannedDeliveryDate: emptyStringOr(DateOnlyIsoString),
    preferredDeliveryDate: emptyStringOr(DateOnlyIsoString),
    salesPersonId: requiredSelection(AuthId, 'Select a salesperson'),
    selectedAssemblies: z.array(QuoteSelectedAssemblyInput),
    status: QuoteStatus,
    validUntil: emptyStringOr(DateIsoString),
    workTitle: z.string(),
    workItems: z.array(QuoteWorkItemFormValue),
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

    if (kind === 'product' && value.workItems.length > 0) {
      context.addIssue({
        code: 'custom',
        message: 'Work items are only allowed on Custom Quotes',
        path: ['workItems'],
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
  hourlyRate: DEFAULT_CUSTOM_HOURLY_RATE,
  notes: '',
  documentNotes: '',
  plannedDeliveryDate: '',
  preferredDeliveryDate: '',
  salesPersonId: '',
  selectedAssemblies: [],
  status: 'draft',
  validUntil: '',
  workTitle: '',
  workItems: [],
};

export const QUOTE_CREATE_DEFAULT_VALUES: QuoteCreateFormValues = {
  basePrice: 0,
  hourlyRate: DEFAULT_CUSTOM_HOURLY_RATE,
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

/**
 * Schema → form. Builds the browser form state from an existing quote. Nullable schema fields
 * collapse to `''` for controlled inputs.
 */
export function toQuoteFormValues(initialQuote: QuoteDetail): QuoteFormValues {
  return {
    basePrice: initialQuote.quotedBasePrice,
    ...toQuoteWorkItemFormState(initialQuote),
    depositPercent: initialQuote.depositPercent,
    deliveryIncluded: initialQuote.deliveryIncluded,
    deliveryPrice: initialQuote.deliveryPrice,
    discountPercent: initialQuote.discountPercent,
    notes: initialQuote.notes ?? '',
    documentNotes: initialQuote.documentNotes ?? '',
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
        : {
            kind: 'custom',
            basePrice: value.basePrice,
            hourlyRate: value.hourlyRate,
            workTitle: value.workTitle,
          },
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
        : {
            kind: 'custom',
            basePrice: value.basePrice,
            hourlyRate: value.hourlyRate,
            workTitle: value.workTitle,
            workItems: value.workItems,
          },
    deliveryIncluded: value.deliveryIncluded,
    deliveryPrice: computeAdditionalDeliveryPrice(value),
    depositPercent: value.depositPercent,
    discountPercent: value.discountPercent,
    notes: value.notes,
    documentNotes: value.documentNotes,
    plannedDeliveryDate: value.plannedDeliveryDate || null,
    preferredDeliveryDate: value.preferredDeliveryDate || null,
    salesPersonId: value.salesPersonId,
    selectedAssemblies: value.selectedAssemblies,
    status: value.status,
    validUntil: value.validUntil || null,
  });
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
  value: Pick<QuoteCreateFormSelectionValues, 'basePrice' | 'hourlyRate' | 'kind' | 'productId' | 'workTitle'>,
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

  if (value.kind === 'custom' && !QuoteHourlyRate.safeParse(value.hourlyRate).success) {
    context.addIssue({
      code: 'custom',
      message: 'Hourly rate is required',
      path: ['hourlyRate'],
    });
  }
}
