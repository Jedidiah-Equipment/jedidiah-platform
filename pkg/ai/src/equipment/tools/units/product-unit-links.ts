import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import {
  createCustomerAppHref,
  createProductAppHref,
  createProductUnitAppHref,
  InternalAppHref,
} from '@pkg/schema/equipment';
import { z } from 'zod';

export type ProductUnitLinks = z.infer<typeof ProductUnitLinks>;
export const ProductUnitLinks = z.object({
  app: InternalAppHref,
  owner: InternalAppHref.optional(),
  product: InternalAppHref.optional(),
});

export function createProductUnitLinks(
  unit: { id: string; owner: { id: string } | null; product: { id: string } },
  access: UserAccessSummary | null,
): ProductUnitLinks {
  return ProductUnitLinks.parse({
    app: createProductUnitAppHref(unit.id),
    // A Unit in Stock has no Owner to link to.
    ...(unit.owner && hasPermission(access, 'equipment_customer:read')
      ? { owner: createCustomerAppHref(unit.owner.id) }
      : {}),
    ...(hasPermission(access, 'equipment_product:read') ? { product: createProductAppHref(unit.product.id) } : {}),
  });
}
