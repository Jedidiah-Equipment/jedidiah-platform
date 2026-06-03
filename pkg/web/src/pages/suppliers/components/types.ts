import {
  NullableThumbnailDataUrl,
  type Supplier,
  SupplierCompanyName,
  SupplierCreateInput,
  SupplierEmail,
  SupplierOptionalText,
  SupplierUpdateInput,
  type UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/utils/form-schema.js';

export type SupplierFormValues = z.infer<typeof SupplierFormValues>;
export const SupplierFormValues = z.object({
  address: emptyStringOr(SupplierOptionalText),
  companyName: SupplierCompanyName,
  contactPerson: emptyStringOr(SupplierOptionalText),
  email: emptyStringOr(SupplierEmail),
  notes: emptyStringOr(SupplierOptionalText),
  phone: emptyStringOr(SupplierOptionalText),
  thumbnailDataUrl: NullableThumbnailDataUrl,
});

export type SupplierCreateFormValues = z.infer<typeof SupplierCreateFormValues>;
export const SupplierCreateFormValues = z.object({
  companyName: SupplierCompanyName,
});

/** Schema → form. Nullable schema fields collapse to `''` for controlled inputs. */
export function toSupplierFormValues(initialSupplier?: Supplier): SupplierFormValues {
  return {
    address: initialSupplier?.address ?? '',
    companyName: initialSupplier?.companyName ?? '',
    contactPerson: initialSupplier?.contactPerson ?? '',
    email: initialSupplier?.email ?? '',
    notes: initialSupplier?.notes ?? '',
    phone: initialSupplier?.phone ?? '',
    thumbnailDataUrl: initialSupplier?.thumbnailDataUrl ?? null,
  };
}

/**
 * Form → schema. Field names align with the API contract, so parsing through `SupplierCreateInput`
 * applies the shared transforms (`''` → null, email trim/lowercase) and enforces the contract.
 */
export function toSupplierCreateInput(value: SupplierFormValues): SupplierCreateInput {
  return SupplierCreateInput.parse(value);
}

export function toSupplierMinimalCreateInput(value: SupplierCreateFormValues): SupplierCreateInput {
  return SupplierCreateInput.parse(value);
}

export function toSupplierUpdateInput(id: UUID, value: SupplierFormValues): SupplierUpdateInput {
  return SupplierUpdateInput.parse({
    ...toSupplierCreateInput(value),
    id,
  });
}
