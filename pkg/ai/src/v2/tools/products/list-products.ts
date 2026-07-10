import * as productsCore from '@pkg/core';
import { ProductListInput, type ProductListResult } from '@pkg/schema';

import type { AiV2Context } from '@/v2/context.js';

const PRODUCT_LIST_KEYS = [
  'name',
  'nameHighlight',
  'description',
  'modelCode',
  'range',
  'basePrice',
  'buildTimeDays',
  'currencyCode',
  'requiresVinNumber',
  'category',
  'keyFeatures',
  'technicalDetails',
  'createdAt',
] as const;

const PRODUCT_ASSEMBLY_KEYS = ['id', 'kind', 'name', 'price', 'parts', 'overrideStandardAssemblyIds'] as const;
const PRODUCT_BAY_KEYS = ['defaultWorkingDays'] as const;
const BAY_KEYS = ['id', 'department', 'name'] as const;

export const listProductsDefinition = {
  name: 'listProducts',
  description: [
    'List Products visible to Product readers.',
    'Use when: Searching Products by free text.',
    'Free-text search matches: Product name, Product model code, description, Product UUID.',
    'Relevant result identifiers: Product name, Product model code.',
    'Links: Product records link by name.',
  ].join('\n'),
  inputSchema: ProductListInput,
  requiredPermission: 'product:read',
  async handler(args: unknown, ctx: AiV2Context): Promise<ProductListResult> {
    const input = ProductListInput.parse(args ?? {});
    return productsCore.listProducts({ db: ctx.db, input, log: ctx.log });
  },
  projectResult(result: ProductListResult): unknown {
    return {
      items: result.items.map(projectProductListItem),
      total: result.total,
    };
  },
} as const;

function projectProductListItem(value: ProductListResult['items'][number]): unknown {
  return {
    id: value.id,
    ...pickDefined(value, PRODUCT_LIST_KEYS),
    ...(Array.isArray(value.assemblies)
      ? { assemblies: value.assemblies.map((assembly) => pickDefined(assembly, PRODUCT_ASSEMBLY_KEYS)) }
      : {}),
    ...(Array.isArray(value.productBays)
      ? {
          productBays: value.productBays.map((productBay) => ({
            ...pickDefined(productBay, PRODUCT_BAY_KEYS),
            ...(productBay.bay ? { bay: pickDefined(productBay.bay, BAY_KEYS) } : {}),
          })),
        }
      : {}),
    ...(value.name ? { links: [{ entity: 'Product', href: `/products/${value.id}/edit`, label: value.name }] } : {}),
  };
}

function pickDefined(value: object, keys: readonly string[]): Record<string, unknown> {
  const record = value as Record<string, unknown>;
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]));
}
