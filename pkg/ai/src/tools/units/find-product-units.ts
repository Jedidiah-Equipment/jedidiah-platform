import * as productUnitsCore from '@pkg/core';
import {
  ProductUnitListInput,
  type ProductUnitListResult,
  ProductUnitSummary,
  type UserAccessSummary,
} from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '@/context.js';

import { createProductUnitLinks, ProductUnitLinks } from './product-unit-links.js';

export type FindProductUnitsInput = z.infer<typeof FindProductUnitsInput>;
export const FindProductUnitsInput = ProductUnitListInput.pick({ columnFilters: true, search: true }).strict();

const FindProductUnitItem = ProductUnitSummary.extend({ links: ProductUnitLinks });

export type FindProductUnitsResponse = z.infer<typeof FindProductUnitsResponse>;
export const FindProductUnitsResponse = z.array(FindProductUnitItem);

export function toCoreProductUnitListInput(input: FindProductUnitsInput): ProductUnitListInput {
  return {
    columnFilters: input.columnFilters,
    page: 1,
    pageSize: 0,
    search: input.search,
    sortBy: 'productSerialNumber',
    sortDirection: 'asc',
  };
}

export function toFindProductUnitsResponse(
  result: ProductUnitListResult,
  access: UserAccessSummary | null,
): FindProductUnitsResponse {
  return FindProductUnitsResponse.parse(
    result.items.map((unit) => ({ ...unit, links: createProductUnitLinks(unit, access) })),
  );
}

export const findProductUnitsDefinition = {
  name: 'findProductUnits',
  description: [
    'Search for Product Units — the physical machines — by Product Serial Number, optionally narrowed by build state, Owner, or Product.',
    'In columnFilters, pass owner "stock" for the machines we hold, or an Owner Customer UUID for the ones a Customer holds.',
    'Returns serial number, VIN, build state, Owner, Product, and app links.',
    'Call getProductUnit with the selected id when the As-Built Spec, Jobs, or ownership history are needed.',
  ].join('\n'),
  inputSchema: FindProductUnitsInput,
  outputSchema: FindProductUnitsResponse,
  anyOfPermissions: ['product_unit:read'],
  async handler(args: unknown, ctx: AiContext): Promise<FindProductUnitsResponse> {
    const input = FindProductUnitsInput.parse(args ?? {});
    const result = await productUnitsCore.listProductUnits({ db: ctx.db, input: toCoreProductUnitListInput(input) });
    return toFindProductUnitsResponse(result, ctx.access);
  },
} as const;
