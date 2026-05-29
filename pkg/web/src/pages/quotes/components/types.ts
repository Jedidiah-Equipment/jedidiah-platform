import {
  type Assembly,
  AuthId,
  CustomerCompanyName,
  DateIsoString,
  DateOnlyIsoString,
  Price,
  QuoteCreateInput,
  type QuoteDetail,
  QuoteNotes,
  QuotePaymentTerms,
  type QuoteSelectedAssembly,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr, requiredSelection } from '@/components/form/form-schema.js';

export const CustomerMode = z.enum(['existing', 'inline']);

export type QuoteFormValues = z.infer<typeof QuoteFormValues>;
export const QuoteFormValues = z
  .object({
    customerId: z.string(),
    customerMode: CustomerMode,
    deliveryIncluded: z.boolean(),
    deliveryPrice: Price,
    discount: Price,
    inlineCompanyName: z.string(),
    notes: emptyStringOr(QuoteNotes),
    paymentTerms: emptyStringOr(QuotePaymentTerms),
    plannedDeliveryDate: emptyStringOr(DateOnlyIsoString),
    preferredDeliveryDate: emptyStringOr(DateOnlyIsoString),
    productId: requiredSelection(UUID, 'Select a product'),
    salesPersonId: requiredSelection(AuthId, 'Select a salesperson'),
    selectedAssemblies: z.array(QuoteSelectedAssemblyInput),
    status: QuoteStatus,
    validUntil: emptyStringOr(DateIsoString),
  })
  .superRefine((value, context) => {
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
  });

/**
 * Schema → form. Builds the browser form state from an existing quote (edit mode) or the
 * blank defaults (create mode). Nullable schema fields collapse to `''` for controlled inputs.
 */
export function toQuoteFormValues(initialQuote?: QuoteDetail): QuoteFormValues {
  return {
    customerId: initialQuote?.customerId ?? '',
    customerMode: 'existing',
    deliveryIncluded: initialQuote?.deliveryIncluded ?? true,
    deliveryPrice: initialQuote?.deliveryPrice ?? 0,
    discount: initialQuote?.discount ?? 0,
    inlineCompanyName: '',
    notes: initialQuote?.notes ?? '',
    paymentTerms: initialQuote?.paymentTerms ?? '',
    plannedDeliveryDate: initialQuote?.plannedDeliveryDate ?? '',
    preferredDeliveryDate: initialQuote?.preferredDeliveryDate ?? '',
    productId: initialQuote?.productId ?? '',
    salesPersonId: initialQuote?.salesPersonId ?? '',
    selectedAssemblies:
      initialQuote?.selectedAssemblies.map(
        (selection): QuoteSelectedAssemblyInput => ({ type: 'existing', id: selection.id }),
      ) ?? [],
    status: initialQuote?.status ?? 'draft',
    validUntil: initialQuote?.validUntil ?? '',
  };
}

/**
 * Form → schema. Assembles the API request from form state: the customer discriminated union
 * from the mode flags, delivery price gated on `deliveryIncluded`, and `''` dates back to `null`.
 * Parsing through `QuoteCreateInput` enforces the schema contract on the result.
 */
export function toQuoteCreateInput(value: QuoteFormValues): QuoteCreateInput {
  return QuoteCreateInput.parse({
    customer:
      value.customerMode === 'existing'
        ? { type: 'existing', customerId: value.customerId }
        : { type: 'inline', companyName: value.inlineCompanyName },
    deliveryIncluded: value.deliveryIncluded,
    deliveryPrice: value.deliveryIncluded ? value.deliveryPrice : 0,
    discount: value.discount,
    notes: value.notes,
    paymentTerms: value.paymentTerms,
    plannedDeliveryDate: value.plannedDeliveryDate || null,
    preferredDeliveryDate: value.preferredDeliveryDate || null,
    productId: value.productId,
    salesPersonId: value.salesPersonId,
    selectedAssemblies: value.selectedAssemblies,
    status: value.status,
    validUntil: value.validUntil || null,
  });
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

      if (!assembly || assembly.kind !== 'optional') {
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

export function getOverriddenStandardAssemblyIds(
  catalogAssemblies: Assembly[],
  selectedCatalogAssemblyIds: Set<string>,
) {
  const overriddenIds = new Set<string>();

  for (const assembly of catalogAssemblies) {
    if (assembly.kind !== 'optional' || !selectedCatalogAssemblyIds.has(assembly.id)) {
      continue;
    }

    for (const standardAssemblyId of assembly.overrideStandardAssemblyIds) {
      overriddenIds.add(standardAssemblyId);
    }
  }

  return overriddenIds;
}
