import { CustomerEmail, CustomerName, CustomerOptionalText, FarmName, WorkTypeName } from '@pkg/schema/contracting';
import { z } from 'zod';
import { emptyStringOr } from '@/components/form/utils/form-schema.js';

export const CustomerCreateValues = z.object({ name: CustomerName });
export const CustomerFormValues = z.object({
  name: CustomerName,
  contactName: CustomerOptionalText,
  phone: CustomerOptionalText,
  email: emptyStringOr(CustomerEmail),
  notes: CustomerOptionalText,
});
export const WorkTypeCreateValues = z.object({ name: WorkTypeName });
export const WorkTypeFormValues = z.object({ name: WorkTypeName, active: z.boolean() });
export const FarmFormValues = z.object({ name: FarmName });
