import {
  type Supplier,
  SupplierCompanyName,
  SupplierCreateInput,
  SupplierEmail,
  SupplierOptionalText,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/form-schema.js';

export type SupplierFormValues = z.infer<typeof SupplierFormValues>;
export const SupplierFormValues = z.object({
  address: emptyStringOr(SupplierOptionalText),
  companyName: SupplierCompanyName,
  contactPerson: emptyStringOr(SupplierOptionalText),
  email: emptyStringOr(SupplierEmail),
  notes: emptyStringOr(SupplierOptionalText),
  phone: emptyStringOr(SupplierOptionalText),
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
  };
}

/**
 * Form → schema. Field names align with the API contract, so parsing through `SupplierCreateInput`
 * applies the shared transforms (`''` → null, email trim/lowercase) and enforces the contract.
 */
export function toSupplierCreateInput(value: SupplierFormValues): SupplierCreateInput {
  return SupplierCreateInput.parse(value);
}
