import {
  type Customer,
  CustomerCompanyName,
  CustomerCreateInput,
  CustomerEmail,
  CustomerOptionalText,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/form-schema.js';

export type CustomerFormValues = z.infer<typeof CustomerFormValues>;
export const CustomerFormValues = z.object({
  address: emptyStringOr(CustomerOptionalText),
  companyName: CustomerCompanyName,
  contactPerson: emptyStringOr(CustomerOptionalText),
  email: emptyStringOr(CustomerEmail),
  notes: emptyStringOr(CustomerOptionalText),
  phone: emptyStringOr(CustomerOptionalText),
});

/** Schema → form. Nullable schema fields collapse to `''` for controlled inputs. */
export function toCustomerFormValues(initialCustomer?: Customer): CustomerFormValues {
  return {
    address: initialCustomer?.address ?? '',
    companyName: initialCustomer?.companyName ?? '',
    contactPerson: initialCustomer?.contactPerson ?? '',
    email: initialCustomer?.email ?? '',
    notes: initialCustomer?.notes ?? '',
    phone: initialCustomer?.phone ?? '',
  };
}

/**
 * Form → schema. Field names align with the API contract, so parsing through `CustomerCreateInput`
 * applies the shared transforms (`''` → null, email trim/lowercase) and enforces the contract.
 */
export function toCustomerCreateInput(value: CustomerFormValues): CustomerCreateInput {
  return CustomerCreateInput.parse(value);
}
