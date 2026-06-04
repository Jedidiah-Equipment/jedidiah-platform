import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { createSearchedSortedPagedQueryInput, createSortedPagedQueryResult } from '../common/pagination.js';
import { NullablePhoneNumber } from '../common/phone-number.js';
import {
  nullableEmailInput,
  nullableTrimmedText,
  nullableTrimmedTextInput,
  requiredTrimmedText,
} from '../common/text.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { UUID } from '../common/uuid.js';

export type SupplierCompanyName = z.infer<typeof SupplierCompanyName>;
export const SupplierCompanyName = requiredTrimmedText('Company name is required');

export type SupplierEmail = z.infer<typeof SupplierEmail>;
export const SupplierEmail = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export type SupplierEmailInput = z.infer<typeof SupplierEmailInput>;
export const SupplierEmailInput = nullableEmailInput();

export type SupplierOptionalText = z.infer<typeof SupplierOptionalText>;
export const SupplierOptionalText = nullableTrimmedText();

export type SupplierOptionalTextInput = z.infer<typeof SupplierOptionalTextInput>;
export const SupplierOptionalTextInput = nullableTrimmedTextInput();

export type SupplierPhone = z.infer<typeof SupplierPhone>;
export const SupplierPhone = NullablePhoneNumber;

export type Supplier = z.infer<typeof Supplier>;
export const Supplier = z.object({
  id: UUID,
  companyName: SupplierCompanyName,
  email: SupplierEmail.nullable(),
  address: SupplierOptionalText,
  contactPerson: SupplierOptionalText,
  phone: SupplierPhone,
  notes: SupplierOptionalText,
  thumbnailDataUrl: NullableThumbnailDataUrl,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type SupplierSortBy = z.infer<typeof SupplierSortBy>;
export const SupplierSortBy = z.enum(['companyName', 'createdAt', 'email', 'id']);

export type SupplierColumnFilters = z.infer<typeof SupplierColumnFilters>;
export const SupplierColumnFilters = z
  .object({
    companyName: z.string().trim().optional(),
    email: z.string().trim().optional(),
    id: z.string().trim().optional(),
  })
  .default({});

export type SupplierCreateInput = z.infer<typeof SupplierCreateInput>;
export const SupplierCreateInput = z.object({
  companyName: SupplierCompanyName,
  email: SupplierEmailInput,
  address: SupplierOptionalTextInput,
  contactPerson: SupplierOptionalTextInput,
  phone: SupplierPhone.default(null),
  notes: SupplierOptionalTextInput,
  thumbnailDataUrl: NullableThumbnailDataUrl.default(null),
});

export type SupplierUpdateInput = z.infer<typeof SupplierUpdateInput>;
export const SupplierUpdateInput = SupplierCreateInput.extend({
  id: UUID,
});

export type SupplierListInput = z.infer<typeof SupplierListInput>;
export const SupplierListInput = createSearchedSortedPagedQueryInput({
  shape: {
    columnFilters: SupplierColumnFilters,
  },
  sortBy: SupplierSortBy.default('companyName'),
});

export type SupplierListResult = z.infer<typeof SupplierListResult>;
export const SupplierListResult = createSortedPagedQueryResult(Supplier, SupplierSortBy);
