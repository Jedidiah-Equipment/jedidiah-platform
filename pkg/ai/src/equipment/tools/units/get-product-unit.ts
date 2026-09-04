import * as productUnitsCore from '@pkg/core/equipment';
import { type UserAccessSummary, UUID } from '@pkg/schema';
import { ProductUnitDetail } from '@pkg/schema/equipment';
import { z } from 'zod';

import type { AiContext } from '@/equipment/context.js';

import { createProductUnitLinks, ProductUnitLinks } from './product-unit-links.js';
import { ProductUnitProductResponse } from './product-unit-response.js';

export type GetProductUnitInput = z.infer<typeof GetProductUnitInput>;
export const GetProductUnitInput = z.object({ id: UUID }).strict();

export type GetProductUnitResponse = z.infer<typeof GetProductUnitResponse>;
export const GetProductUnitResponse = ProductUnitDetail.extend({
  links: ProductUnitLinks,
  product: ProductUnitProductResponse,
});

export function toGetProductUnitResponse(
  unit: ProductUnitDetail,
  access: UserAccessSummary | null,
): GetProductUnitResponse {
  return GetProductUnitResponse.parse({ ...unit, links: createProductUnitLinks(unit, access) });
}

export const getProductUnitDefinition = {
  name: 'getProductUnit',
  description: [
    'Get the full details for one Product Unit by UUID.',
    'Use after findProductUnits identifies the machine the user means.',
    'Returns serial number, VIN, build state, current Owner, the As-Built Spec, the Jobs that built or reworked it, its ownership history, and app links.',
  ].join('\n'),
  inputSchema: GetProductUnitInput,
  outputSchema: GetProductUnitResponse,
  anyOfPermissions: ['equipment_product_unit:read'],
  async handler(args: unknown, ctx: AiContext): Promise<GetProductUnitResponse> {
    const input = GetProductUnitInput.parse(args);
    const unit = await productUnitsCore.getProductUnit({ db: ctx.db, id: input.id });
    return toGetProductUnitResponse(unit, ctx.access);
  },
} as const;
