import { z } from 'zod';

import { createPagedQueryResult, PagedQueryInput } from '../common/pagination.js';
import { SortDirection } from '../common/sort.js';
import { UUID } from '../common/uuid.js';

export type SupplierName = z.infer<typeof SupplierName>;
export const SupplierName = z.string().trim().min(1, 'Supplier name is required');

export type Supplier = z.infer<typeof Supplier>;
export const Supplier = z.object({
  id: UUID,
  name: SupplierName,
});

export type SupplierSortBy = z.infer<typeof SupplierSortBy>;
export const SupplierSortBy = z.enum(['id', 'name']);

export type SupplierColumnFilters = z.infer<typeof SupplierColumnFilters>;
export const SupplierColumnFilters = z
  .object({
    id: z.string().trim().optional(),
    name: z.string().trim().optional(),
  })
  .default({});

export type SupplierCreateInput = z.infer<typeof SupplierCreateInput>;
export const SupplierCreateInput = z.object({
  name: SupplierName,
});

export type SupplierUpdateInput = z.infer<typeof SupplierUpdateInput>;
export const SupplierUpdateInput = SupplierCreateInput.extend({
  id: UUID,
});

export type SupplierListInput = z.infer<typeof SupplierListInput>;
export const SupplierListInput = PagedQueryInput.extend({
  search: z.string().trim().default(''),
  columnFilters: SupplierColumnFilters,
  sortBy: SupplierSortBy.default('name'),
  sortDirection: SortDirection.default('asc'),
});

export type SupplierListResult = z.infer<typeof SupplierListResult>;
export const SupplierListResult = createPagedQueryResult(Supplier).extend({
  sortBy: SupplierSortBy,
  sortDirection: SortDirection,
});
