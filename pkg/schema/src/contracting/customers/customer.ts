import { z } from 'zod';
import { DateIso } from '../../common/date.js';
import {
  EmailAddress,
  nullableEmailInputOptional,
  nullableTrimmedTextInputOptional,
  requiredTrimmedText,
} from '../../common/text.js';
import { UUID } from '../../common/uuid.js';

export const CustomerName = requiredTrimmedText('Name is required');
export const CustomerOptionalText = nullableTrimmedTextInputOptional();
export const CustomerEmail = EmailAddress;
export const CustomerCreateInput = z
  .object({
    name: CustomerName,
    contactName: CustomerOptionalText,
    phone: CustomerOptionalText,
    email: nullableEmailInputOptional(),
    notes: CustomerOptionalText,
  })
  .strict();
export type CustomerCreateInput = z.infer<typeof CustomerCreateInput>;
export const CustomerPatchInput = CustomerCreateInput.partial().extend({ id: UUID }).strict();
export type CustomerPatchInput = z.infer<typeof CustomerPatchInput>;
export const Customer = z.object({
  id: UUID,
  name: CustomerName,
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: CustomerEmail.nullable(),
  notes: z.string().nullable(),
  createdAt: DateIso,
  updatedAt: DateIso,
});
export type Customer = z.infer<typeof Customer>;
