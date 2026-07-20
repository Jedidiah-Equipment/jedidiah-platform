import {
  AuthId,
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

const CustomerMode = z.enum(['existing', 'inline']);

const QuoteCreateFormValuesShape = z.object({
  basePrice: z.string(),
  customerId: z.string(),
  customerMode: CustomerMode,
  inlineCompanyName: z.string(),
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
    value.customerMode === 'existing'
      ? UUID.safeParse(value.customerId).success
      : CustomerCompanyName.safeParse(value.inlineCompanyName).success;

  if (!customerIsValid) {
    context.addIssue({ code: 'custom', message: 'Select or create a customer', path: ['customerId'] });
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

    const parsedBasePrice = parseBasePrice(value.basePrice);
    if (!parsedBasePrice.success) {
      context.addIssue({ code: 'custom', message: parsedBasePrice.message, path: ['basePrice'] });
    }
  }

  if (!AuthId.safeParse(value.salesPersonId).success) {
    context.addIssue({ code: 'custom', message: 'Select a salesperson', path: ['salesPersonId'] });
  }
});

export const QUOTE_CREATE_DEFAULT_VALUES: QuoteCreateFormValues = {
  basePrice: '',
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

export function clearQuoteKindFields(
  values: QuoteCreateFormValues,
  kind: QuoteCreateFormValues['kind'],
): QuoteCreateFormValues {
  return kind === 'product'
    ? { ...values, basePrice: '', kind, workTitle: '' }
    : { ...values, kind, productId: '', rangeId: '' };
}

export function defaultQuoteSalesPersonId(user: { id: string } | null | undefined): string {
  return user?.id ?? '';
}

/**
 * Form to wire input. Parsing here applies every create-time schema default while
 * keeping the mobile form concerned only with fields the operator can edit.
 */
export function toQuoteCreateInput(value: QuoteCreateFormValues): QuoteCreateInputValue {
  return QuoteCreateInput.parse({
    customer:
      value.customerMode === 'existing'
        ? { type: 'existing', customerId: value.customerId }
        : { type: 'inline', companyName: value.inlineCompanyName },
    offering:
      value.kind === 'product'
        ? { kind: 'product', productId: value.productId }
        : { kind: 'custom', basePrice: Number(value.basePrice), workTitle: value.workTitle },
    salesPersonId: value.salesPersonId,
    status: value.status,
  });
}

function parseBasePrice(value: string): { success: true; value: number } | { message: string; success: false } {
  if (value.trim() === '') return { message: 'Base price is required', success: false };

  const number = Number(value);
  if (!Number.isFinite(number)) return { message: 'Enter a valid base price', success: false };

  const result = Price.safeParse(number);
  return result.success
    ? { success: true, value: result.data }
    : { message: result.error.issues[0]?.message ?? 'Enter a valid base price', success: false };
}
