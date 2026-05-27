import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { createPagedQueryResult, PagedQueryInput } from '../common/pagination.js';
import { SortDirection } from '../common/sort.js';
import { UUID } from '../common/uuid.js';

export type SupplierCompanyName = z.infer<typeof SupplierCompanyName>;
export const SupplierCompanyName = z.string().trim().min(1, 'Company name is required');

export type SupplierEmail = z.infer<typeof SupplierEmail>;
export const SupplierEmail = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export type SupplierEmailInput = z.infer<typeof SupplierEmailInput>;
export const SupplierEmailInput = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null)
  .pipe(SupplierEmail.nullable());

export type SupplierOptionalText = z.infer<typeof SupplierOptionalText>;
export const SupplierOptionalText = z.string().trim().min(1).nullable();

export type SupplierOptionalTextInput = z.infer<typeof SupplierOptionalTextInput>;
export const SupplierOptionalTextInput = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null);

export type Supplier = z.infer<typeof Supplier>;
export const Supplier = z.object({
  id: UUID,
  companyName: SupplierCompanyName,
  email: SupplierEmail.nullable(),
  address: SupplierOptionalText,
  contactPerson: SupplierOptionalText,
  phone: SupplierOptionalText,
  notes: SupplierOptionalText,
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
  phone: SupplierOptionalTextInput,
  notes: SupplierOptionalTextInput,
});

export type SupplierUpdateInput = z.infer<typeof SupplierUpdateInput>;
export const SupplierUpdateInput = SupplierCreateInput.extend({
  id: UUID,
});

export type SupplierListInput = z.infer<typeof SupplierListInput>;
export const SupplierListInput = PagedQueryInput.extend({
  search: z.string().trim().default(''),
  columnFilters: SupplierColumnFilters,
  sortBy: SupplierSortBy.default('companyName'),
  sortDirection: SortDirection.default('asc'),
});

export type SupplierListResult = z.infer<typeof SupplierListResult>;
export const SupplierListResult = createPagedQueryResult(Supplier).extend({
  sortBy: SupplierSortBy,
  sortDirection: SortDirection,
});
