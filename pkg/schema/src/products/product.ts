import { z } from 'zod';
import { Department } from '../auth/authorization.js';
import { DateIso } from '../common/date.js';
import { createPagedQueryResult, PagedQueryInput } from '../common/pagination.js';
import { Price } from '../common/price.js';
import { SortDirection } from '../common/sort.js';
import { UUID } from '../common/uuid.js';
import { ProductOption, ProductOptionCreateInput, ProductOptionUpsertInput } from './product-option.js';

export type ProductName = z.infer<typeof ProductName>;
export const ProductName = z.string().trim().min(1, 'Product name is required');

export type ProductModelCode = z.infer<typeof ProductModelCode>;
export const ProductModelCode = z.string().trim().min(1, 'Model code is required');

export type ProductDescription = z.infer<typeof ProductDescription>;
export const ProductDescription = z.string().trim().min(1).nullable();

export type ProductDescriptionInput = z.infer<typeof ProductDescriptionInput>;
export const ProductDescriptionInput = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null);

export type ProductBasePrice = z.infer<typeof ProductBasePrice>;
export const ProductBasePrice = z.coerce.number().pipe(Price);

export type ProductCurrencyCode = z.infer<typeof ProductCurrencyCode>;
export const ProductCurrencyCode = z.literal('ZAR').default('ZAR');

export type ProductDepartmentConfig = z.infer<typeof ProductDepartmentConfig>;
export const ProductDepartmentConfig = z.object({
  department: Department,
  durationDays: z.coerce.number().int().min(0),
  defaultStationIds: z.array(UUID).default([]),
});

export type Product = z.infer<typeof Product>;
export const Product = z.object({
  id: UUID,
  name: ProductName,
  description: ProductDescription,
  modelCode: ProductModelCode,
  basePrice: ProductBasePrice,
  currencyCode: ProductCurrencyCode,
  departmentConfigs: z.array(ProductDepartmentConfig).default([]),
  options: z.array(ProductOption).default([]),
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type ProductSortBy = z.infer<typeof ProductSortBy>;
export const ProductSortBy = z.enum(['basePrice', 'createdAt', 'id', 'modelCode', 'name']);

export type ProductColumnFilters = z.infer<typeof ProductColumnFilters>;
export const ProductColumnFilters = z
  .object({
    id: z.string().trim().optional(),
    modelCode: z.string().trim().optional(),
    name: z.string().trim().optional(),
  })
  .default({});

export type ProductCreateInput = z.infer<typeof ProductCreateInput>;
export const ProductCreateInput = z
  .object({
    name: ProductName,
    description: ProductDescriptionInput,
    modelCode: ProductModelCode,
    basePrice: ProductBasePrice,
    currencyCode: ProductCurrencyCode,
    departmentConfigs: z.array(ProductDepartmentConfig).default([]),
    options: z.array(ProductOptionCreateInput).default([]),
  })
  .superRefine(rejectDuplicateDepartmentConfigs)
  .superRefine(rejectDuplicateDefaultStationIds)
  .superRefine(rejectDuplicateOptionCodes);

export type ProductUpdateInput = z.infer<typeof ProductUpdateInput>;
export const ProductUpdateInput = z
  .object({
    id: UUID,
    basePrice: ProductBasePrice,
    currencyCode: ProductCurrencyCode,
    description: ProductDescriptionInput,
    modelCode: ProductModelCode,
    name: ProductName,
    departmentConfigs: z.array(ProductDepartmentConfig).default([]),
    options: z.array(ProductOptionUpsertInput).default([]),
  })
  .superRefine(rejectDuplicateDepartmentConfigs)
  .superRefine(rejectDuplicateDefaultStationIds)
  .superRefine(rejectDuplicateOptionCodes);

export type ProductListInput = z.infer<typeof ProductListInput>;
export const ProductListInput = PagedQueryInput.extend({
  search: z.string().trim().default(''),
  columnFilters: ProductColumnFilters,
  sortBy: ProductSortBy.default('name'),
  sortDirection: SortDirection.default('asc'),
});

export type ProductListResult = z.infer<typeof ProductListResult>;
export const ProductListResult = createPagedQueryResult(Product).extend({
  sortBy: ProductSortBy,
  sortDirection: SortDirection,
});

function rejectDuplicateDepartmentConfigs(
  value: { departmentConfigs: Array<{ department: string }> },
  context: z.RefinementCtx,
): void {
  const seenDepartments = new Map<string, number>();

  value.departmentConfigs.forEach((config, index) => {
    const previousIndex = seenDepartments.get(config.department);

    if (previousIndex !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['departmentConfigs', index, 'department'],
        message: 'Department config must be unique per product',
      });
      context.addIssue({
        code: 'custom',
        path: ['departmentConfigs', previousIndex, 'department'],
        message: 'Department config must be unique per product',
      });
      return;
    }

    seenDepartments.set(config.department, index);
  });
}

function rejectDuplicateDefaultStationIds(
  value: { departmentConfigs: Array<{ defaultStationIds: string[] }> },
  context: z.RefinementCtx,
): void {
  const seenStationIds = new Map<string, Array<number | string>>();

  value.departmentConfigs.forEach((config, configIndex) => {
    config.defaultStationIds.forEach((stationId, stationIndex) => {
      const previousPath = seenStationIds.get(stationId);

      if (previousPath) {
        context.addIssue({
          code: 'custom',
          path: ['departmentConfigs', configIndex, 'defaultStationIds', stationIndex],
          message: 'Default station can only be assigned once per product',
        });
        context.addIssue({
          code: 'custom',
          path: ['departmentConfigs', ...previousPath],
          message: 'Default station can only be assigned once per product',
        });
        return;
      }

      seenStationIds.set(stationId, [configIndex, 'defaultStationIds', stationIndex]);
    });
  });
}

function rejectDuplicateOptionCodes(value: { options: Array<{ code: string }> }, context: z.RefinementCtx): void {
  const seenCodes = new Map<string, number>();

  value.options.forEach((option, index) => {
    const previousIndex = seenCodes.get(option.code);

    if (previousIndex !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['options', index, 'code'],
        message: 'Option code must be unique per product',
      });
      context.addIssue({
        code: 'custom',
        path: ['options', previousIndex, 'code'],
        message: 'Option code must be unique per product',
      });
      return;
    }

    seenCodes.set(option.code, index);
  });
}
