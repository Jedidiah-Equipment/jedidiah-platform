import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { createPagedQueryResult, PagedQueryInput } from '../common/pagination.js';
import { SortDirection } from '../common/sort.js';
import { UUID } from '../common/uuid.js';

export type CustomerCompanyName = z.infer<typeof CustomerCompanyName>;
export const CustomerCompanyName = z.string().trim().min(1, 'Company name is required');

export type CustomerEmail = z.infer<typeof CustomerEmail>;
export const CustomerEmail = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export type CustomerEmailInput = z.infer<typeof CustomerEmailInput>;
export const CustomerEmailInput = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null)
  .pipe(CustomerEmail.nullable());

export type CustomerOptionalText = z.infer<typeof CustomerOptionalText>;
export const CustomerOptionalText = z.string().trim().min(1).nullable();

export type CustomerOptionalTextInput = z.infer<typeof CustomerOptionalTextInput>;
export const CustomerOptionalTextInput = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null);

export type Customer = z.infer<typeof Customer>;
export const Customer = z.object({
  id: UUID,
  companyName: CustomerCompanyName,
  email: CustomerEmail.nullable(),
  address: CustomerOptionalText,
  contactPerson: CustomerOptionalText,
  phone: CustomerOptionalText,
  notes: CustomerOptionalText,
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
  })
  .default({});

export type CustomerCreateInput = z.infer<typeof CustomerCreateInput>;
export const CustomerCreateInput = z.object({
  companyName: CustomerCompanyName,
  email: CustomerEmailInput,
  address: CustomerOptionalTextInput,
  contactPerson: CustomerOptionalTextInput,
  phone: CustomerOptionalTextInput,
  notes: CustomerOptionalTextInput,
});

export type CustomerUpdateInput = z.infer<typeof CustomerUpdateInput>;
export const CustomerUpdateInput = CustomerCreateInput.extend({
  id: UUID,
});

export type CustomerListInput = z.infer<typeof CustomerListInput>;
export const CustomerListInput = PagedQueryInput.extend({
  search: z.string().trim().default(''),
  columnFilters: CustomerColumnFilters,
  sortBy: CustomerSortBy.default('companyName'),
  sortDirection: SortDirection.default('asc'),
});

export type CustomerListResult = z.infer<typeof CustomerListResult>;
export const CustomerListResult = createPagedQueryResult(Customer).extend({
  sortBy: CustomerSortBy,
  sortDirection: SortDirection,
});
