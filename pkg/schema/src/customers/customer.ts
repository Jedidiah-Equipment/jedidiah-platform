import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { createSearchedSortedPagedQueryInput, createSortedPagedQueryResult } from '../common/pagination.js';
import {
  EmailAddress,
  nullableEmailInput,
  nullableTrimmedText,
  nullableTrimmedTextInput,
  requiredTrimmedText,
} from '../common/text.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { UUID } from '../common/uuid.js';

export type CustomerCompanyName = z.infer<typeof CustomerCompanyName>;
export const CustomerCompanyName = requiredTrimmedText('Company name is required');

export type CustomerEmail = z.infer<typeof CustomerEmail>;
export const CustomerEmail = EmailAddress;

export type CustomerEmailInput = z.infer<typeof CustomerEmailInput>;
export const CustomerEmailInput = nullableEmailInput();

export type CustomerOptionalText = z.infer<typeof CustomerOptionalText>;
export const CustomerOptionalText = nullableTrimmedText();

export type CustomerOptionalTextInput = z.infer<typeof CustomerOptionalTextInput>;
export const CustomerOptionalTextInput = nullableTrimmedTextInput();

export type CustomerVatNumber = z.infer<typeof CustomerVatNumber>;
export const CustomerVatNumber = nullableTrimmedText();

export type CustomerVatNumberInput = z.infer<typeof CustomerVatNumberInput>;
export const CustomerVatNumberInput = nullableTrimmedTextInput();

export type Customer = z.infer<typeof Customer>;
export const Customer = z.object({
  id: UUID,
  companyName: CustomerCompanyName,
  email: CustomerEmail.nullable(),
  vatNumber: CustomerVatNumber,
  address: CustomerOptionalText,
  contactPerson: CustomerOptionalText,
  phone: CustomerOptionalText,
  notes: CustomerOptionalText,
  thumbnailDataUrl: NullableThumbnailDataUrl,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type CustomerSortBy = z.infer<typeof CustomerSortBy>;
export const CustomerSortBy = z.enum(['companyName', 'createdAt', 'email', 'id']);

export type CustomerColumnFilters = z.infer<typeof CustomerColumnFilters>;
export const CustomerColumnFilters = z
  .object({
    companyName: z.string().trim().optional(),
    email: z.string().trim().optional(),
    id: z.string().trim().optional(),
    vatNumber: z.string().trim().optional(),
  })
  .default({});

export type CustomerCreateInput = z.infer<typeof CustomerCreateInput>;
export const CustomerCreateInput = z.object({
  companyName: CustomerCompanyName,
  email: CustomerEmailInput,
  vatNumber: CustomerVatNumberInput,
  address: CustomerOptionalTextInput,
  contactPerson: CustomerOptionalTextInput,
  phone: CustomerOptionalTextInput,
  notes: CustomerOptionalTextInput,
  thumbnailDataUrl: NullableThumbnailDataUrl.default(null),
});

export type CustomerUpdateInput = z.infer<typeof CustomerUpdateInput>;
export const CustomerUpdateInput = CustomerCreateInput.extend({
  id: UUID,
});

export type CustomerListInput = z.infer<typeof CustomerListInput>;
export const CustomerListInput = createSearchedSortedPagedQueryInput({
  shape: {
    columnFilters: CustomerColumnFilters,
  },
  sortBy: CustomerSortBy.default('companyName'),
});

export type CustomerListResult = z.infer<typeof CustomerListResult>;
export const CustomerListResult = createSortedPagedQueryResult(Customer, CustomerSortBy);
