import {
  type Assembly,
  AuthId,
  CustomerCompanyName,
  DateIsoString,
  DateOnlyIsoString,
  Price,
  QuoteCreateInput,
  QuoteDepositPercent,
  type QuoteDetail,
  QuoteDiscountPercent,
  QuoteDocumentNotes,
  type QuoteLineItem,
  QuoteLineItemName,
  QuoteLineItemQuantity,
  QuoteNotes,
  type QuoteProductBayAvailabilityResult,
  type QuoteSelectedAssembly,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
  QuoteUpdateInput,
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

export type QuoteCreateFormValues = z.infer<typeof QuoteCreateFormValues>;
export const QuoteCreateFormValues = z
  .object({
    customerId: z.string(),
    customerMode: CustomerMode,
    inlineCompanyName: z.string(),
    productId: requiredSelection(UUID, 'Select a product'),
    rangeId: emptyStringOr(UUID),
    salesPersonId: requiredSelection(AuthId, 'Select a salesperson'),
    status: QuoteStatus,
  })
  .superRefine(refineQuoteCustomerSelection);

export type QuoteFormValues = z.infer<typeof QuoteFormValues>;
export const QuoteFormValues = z
  .object({
    depositPercent: QuoteDepositPercent,
    deliveryIncluded: z.boolean(),
    deliveryPrice: Price,
    discountPercent: QuoteDiscountPercent,
    notes: emptyStringOr(QuoteNotes),
    documentNotes: emptyStringOr(QuoteDocumentNotes),
    lineItems: z.array(QuoteLineItemFormInput),
    plannedDeliveryDate: emptyStringOr(DateOnlyIsoString),
    preferredDeliveryDate: emptyStringOr(DateOnlyIsoString),
    salesPersonId: requiredSelection(AuthId, 'Select a salesperson'),
    selectedAssemblies: z.array(QuoteSelectedAssemblyInput),
    status: QuoteStatus,
    validUntil: emptyStringOr(DateIsoString),
  })
  .strict();

export const emptyQuoteFormValues: QuoteFormValues = {
  depositPercent: 0,
  deliveryIncluded: true,
  deliveryPrice: 0,
  discountPercent: 0,
  notes: '',
  documentNotes: '',
  lineItems: [],
  plannedDeliveryDate: '',
  preferredDeliveryDate: '',
  salesPersonId: '',
  selectedAssemblies: [],
  status: 'draft',
  validUntil: '',
};

export const QUOTE_CREATE_DEFAULT_VALUES: QuoteCreateFormValues = {
  customerId: '',
  customerMode: 'existing',
  inlineCompanyName: '',
  productId: '',
  rangeId: '',
  salesPersonId: '',
  status: 'draft',
};

/**
 * Schema → form. Builds the browser form state from an existing quote. Nullable schema fields
 * collapse to `''` for controlled inputs.
 */
export function toQuoteFormValues(initialQuote: QuoteDetail): QuoteFormValues {
  return {
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
    productId: value.productId,
    salesPersonId: value.salesPersonId,
    status: value.status,
  });
}

export function toQuoteUpdateInput({ id, value }: { id: UUID; value: QuoteFormValues }): QuoteUpdateInput {
  return QuoteUpdateInput.parse({
    id,
    deliveryIncluded: value.deliveryIncluded,
    deliveryPrice: value.deliveryIncluded ? value.deliveryPrice : 0,
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
  value: Pick<QuoteCreateFormValues, 'customerId' | 'customerMode' | 'inlineCompanyName'>,
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

export function getDefaultQuoteDocumentLeadTime(quote: Pick<QuoteDetail, 'productBuildTimeDays'>): string {
  return quote.productBuildTimeDays === null ? '' : formatQuoteDocumentLeadTime(quote.productBuildTimeDays);
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
