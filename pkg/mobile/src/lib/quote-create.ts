import {
  AuthId,
  Customer,
  CustomerCompanyName,
  Price,
  QuoteCreateInput,
  type QuoteCreateInput as QuoteCreateInputValue,
  QuoteKind,
  QuoteStatus,
  QuoteWorkTitle,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

const CustomerOption = Customer.pick({ companyName: true, email: true, id: true, thumbnailDataUrl: true });
export type CustomerOption = z.infer<typeof CustomerOption>;

/** The picker's selection is the single source of truth for the customer being quoted. */
export type CustomerSelection = z.infer<typeof CustomerSelection>;
const CustomerSelection = z.discriminatedUnion('type', [
  z.object({ customer: CustomerOption, type: z.literal('existing') }),
  z.object({ companyName: z.string(), type: z.literal('inline') }),
]);

const QuoteCreateFormValuesShape = z.object({
  basePrice: z.union([z.number(), z.nan()]),
  customer: CustomerSelection.nullable(),
  kind: QuoteKind,
  productId: z.string(),
  rangeId: z.string(),
  salesPersonId: z.string(),
  status: QuoteStatus,
  workTitle: z.string(),
});

export type QuoteCreateFormValues = z.infer<typeof QuoteCreateFormValuesShape>;

export const QuoteCreateFormValues = QuoteCreateFormValuesShape.superRefine((value, context) => {
  const customerIsValid =
    value.customer?.type === 'existing'
      ? UUID.safeParse(value.customer.customer.id).success
      : CustomerCompanyName.safeParse(value.customer?.companyName).success;

  if (!customerIsValid) {
    context.addIssue({ code: 'custom', message: 'Select or create a customer', path: ['customer'] });
  }

  if (value.kind === 'product') {
    if (!UUID.safeParse(value.productId).success) {
      context.addIssue({ code: 'custom', message: 'Select a product', path: ['productId'] });
    }
  } else {
    const workTitleResult = QuoteWorkTitle.safeParse(value.workTitle);
    if (!workTitleResult.success) {
      context.addIssue({ code: 'custom', message: workTitleResult.error.issues[0]?.message, path: ['workTitle'] });
    }

    const basePriceResult = Price.safeParse(value.basePrice);
    if (!basePriceResult.success) {
      context.addIssue({
        code: 'custom',
        message: Number.isNaN(value.basePrice)
          ? 'Base price is required'
          : (basePriceResult.error.issues[0]?.message ?? 'Enter a valid base price'),
        path: ['basePrice'],
      });
    }
  }

  if (!AuthId.safeParse(value.salesPersonId).success) {
    context.addIssue({ code: 'custom', message: 'Select a salesperson', path: ['salesPersonId'] });
  }
});

export const QUOTE_CREATE_DEFAULT_VALUES: QuoteCreateFormValues = {
  basePrice: Number.NaN,
  customer: null,
  kind: 'product',
  productId: '',
  rangeId: '',
  salesPersonId: '',
  status: 'draft',
  workTitle: '',
};

export function clearQuoteKindFields(
  values: QuoteCreateFormValues,
  kind: QuoteCreateFormValues['kind'],
): QuoteCreateFormValues {
  return kind === 'product'
    ? { ...values, basePrice: Number.NaN, kind, workTitle: '' }
    : { ...values, kind, productId: '', rangeId: '' };
}

/**
 * Form to wire input. Parsing here applies every create-time schema default while
 * keeping the mobile form concerned only with fields the operator can edit.
 */
export function toQuoteCreateInput(value: QuoteCreateFormValues): QuoteCreateInputValue {
  return QuoteCreateInput.parse({
    customer:
      value.customer?.type === 'existing'
        ? { type: 'existing', customerId: value.customer.customer.id }
        : { type: 'inline', companyName: value.customer?.companyName ?? '' },
    offering:
      value.kind === 'product'
        ? { kind: 'product', productId: value.productId }
        : { kind: 'custom', basePrice: value.basePrice, workTitle: value.workTitle },
    salesPersonId: value.salesPersonId,
    status: value.status,
  });
}
