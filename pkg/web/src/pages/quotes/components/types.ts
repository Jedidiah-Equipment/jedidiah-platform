import { computeAdditionalDeliveryPrice, toQuoteWorkItemFormState } from '@pkg/domain';
import {
  AuthId,
  CustomerCompanyName,
  DateIsoString,
  DateOnlyIsoString,
  Department,
  getQuoteDeliveryPricingError,
  Price,
  QuoteCancellationReason,
  QuoteCreateInput,
  QuoteDepositPercent,
  type QuoteDetail,
  QuoteDiscountPercent,
  QuoteDocumentNotes,
  QuoteKind,
  QuoteNotes,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
  QuoteUpdateInput,
  QuoteWorkItemHourlyRate,
  QuoteWorkItemHours,
  type QuoteWorkItemInput,
  QuoteWorkItemName,
  QuoteWorkItemPartName,
  QuoteWorkItemPartQuantity,
  QuoteWorkTitle,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr, requiredSelection } from '@/components/form/utils/form-schema.js';

export const CustomerMode = z.enum(['existing', 'inline']);

/** The picker's fourth option. A Work Item with no Department is the only shape that carries a name. */
export const OTHER_WORK_ITEM_DEPARTMENT = 'other';

const WorkItemDepartmentSelection = z.union([Department, z.literal(OTHER_WORK_ITEM_DEPARTMENT)]);

const QuoteWorkItemPartFormInput = z.object({
  name: QuoteWorkItemPartName,
  quantity: QuoteWorkItemPartQuantity,
  unitPrice: Price,
});

/**
 * Browser shape for a Work Item: the nullable `name` and `description` collapse to `''` for
 * controlled inputs, and a name is required only for the department-less "Other" item — the same
 * pairing `QuoteWorkItemInput` enforces at the API boundary.
 */
const QuoteWorkItemFormInput = z
  .object({
    department: WorkItemDepartmentSelection,
    description: z.string(),
    hourlyRate: QuoteWorkItemHourlyRate,
    hours: QuoteWorkItemHours,
    name: z.string(),
    parts: z.array(QuoteWorkItemPartFormInput),
  })
  .superRefine((value, context) => {
    if (value.department === OTHER_WORK_ITEM_DEPARTMENT && !QuoteWorkItemName.safeParse(value.name).success) {
      context.addIssue({ code: 'custom', message: 'Work item name is required', path: ['name'] });
    }
  });

export const QuoteCreateStatus = QuoteStatus.exclude(['cancelled']);

const QuoteCreateFormValuesShape = z.object({
  customerId: z.string(),
  customerMode: CustomerMode,
  inlineCompanyName: z.string(),
  kind: QuoteKind,
  productId: z.string(),
  rangeId: emptyStringOr(UUID),
  salesPersonId: requiredSelection(AuthId, 'Select a salesperson'),
  status: QuoteCreateStatus,
  workTitle: z.string(),
});
type QuoteCreateFormSelectionValues = z.infer<typeof QuoteCreateFormValuesShape>;
export const QuoteCreateFormValues =
  QuoteCreateFormValuesShape.superRefine(refineQuoteCustomerSelection).superRefine(refineQuoteOfferingSelection);
export type QuoteCreateFormValues = z.infer<typeof QuoteCreateFormValues>;

export type QuoteFormValues = z.infer<typeof QuoteFormValues>;
export const QuoteFormValues = z
  .object({
    cancellationReason: z.string(),
    depositPercent: QuoteDepositPercent,
    deliveryIncluded: z.boolean(),
    deliveryPrice: Price,
    discountPercent: QuoteDiscountPercent,
    notes: emptyStringOr(QuoteNotes),
    documentNotes: emptyStringOr(QuoteDocumentNotes),
    plannedDeliveryDate: emptyStringOr(DateOnlyIsoString),
    preferredDeliveryDate: emptyStringOr(DateOnlyIsoString),
    salesPersonId: requiredSelection(AuthId, 'Select a salesperson'),
    selectedAssemblies: z.array(QuoteSelectedAssemblyInput),
    status: QuoteStatus,
    validUntil: emptyStringOr(DateIsoString),
    workTitle: z.string(),
    workItems: z.array(QuoteWorkItemFormInput),
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

    refineQuoteCancellationReason(value, context);
  });
}

export const emptyQuoteFormValues: QuoteFormValues = {
  cancellationReason: '',
  depositPercent: 0,
  deliveryIncluded: true,
  deliveryPrice: 0,
  discountPercent: 0,
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
    cancellationReason: initialQuote.cancellationReason ?? '',
    workItems: toQuoteWorkItemFormState(initialQuote).workItems.map((workItem) => ({
      ...workItem,
      department: workItem.department ?? OTHER_WORK_ITEM_DEPARTMENT,
      description: workItem.description ?? '',
      name: workItem.name ?? '',
    })),
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
    cancellationReason: null,
    customer:
      value.customerMode === 'existing'
        ? { type: 'existing', customerId: value.customerId }
        : { type: 'inline', companyName: value.inlineCompanyName },
    offering:
      value.kind === 'product'
        ? { kind: 'product', productId: value.productId }
        : { kind: 'custom', workTitle: value.workTitle },
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
    cancellationReason: value.status === 'cancelled' ? value.cancellationReason : null,
    id,
    offering:
      kind === 'product'
        ? { kind: 'product' }
        : { kind: 'custom', workTitle: value.workTitle, workItems: value.workItems.map(toQuoteWorkItemInput) },
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

/**
 * Browser shape → API. A Work Item with a Department stores no name — it is labelled by the
 * Department — so the browser's `''` placeholder never reaches the server as an empty string.
 */
export function toQuoteWorkItemInput(workItem: QuoteFormValues['workItems'][number]): QuoteWorkItemInput {
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
  value: Pick<QuoteCreateFormSelectionValues, 'kind' | 'productId' | 'workTitle'>,
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
}

function refineQuoteCancellationReason(
  value: { cancellationReason: string; status: QuoteStatus },
  context: z.RefinementCtx,
) {
  if (value.status !== 'cancelled') return;

  const result = QuoteCancellationReason.safeParse(value.cancellationReason);
  if (!result.success) {
    context.addIssue({
      code: 'custom',
      message: result.error.issues[0]?.message ?? 'Cancellation reason is required',
      path: ['cancellationReason'],
    });
  }
}
