import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import {
  createCustomerAppHref,
  createJobAppHref,
  createProductAppHref,
  createProductUnitAppHref,
  createQuoteAppHref,
  InternalAppHref,
} from '@pkg/schema/equipment';
import { z } from 'zod';

export type JobLinks = z.infer<typeof JobLinks>;
export const JobLinks = z.object({
  app: InternalAppHref,
  customer: InternalAppHref.optional(),
  product: InternalAppHref.optional(),
  productUnit: InternalAppHref.optional(),
  quote: InternalAppHref.optional(),
});

export function createJobLinks(
  job: {
    customerId: string | null;
    id: string;
    productUnit: { id: string; productId: string } | null;
    quoteId: string | null;
  },
  access: UserAccessSummary | null,
): JobLinks {
  return JobLinks.parse({
    app: createJobAppHref(job.id),
    // A Job on a machine we hold has no Customer to link to.
    ...(job.customerId && hasPermission(access, 'equipment_customer:read')
      ? { customer: createCustomerAppHref(job.customerId) }
      : {}),
    // A Custom Job builds no machine, so it has neither a Product nor a Product Unit to link to.
    ...(job.productUnit && hasPermission(access, 'equipment_product:read')
      ? { product: createProductAppHref(job.productUnit.productId) }
      : {}),
    ...(job.productUnit && hasPermission(access, 'equipment_product_unit:read')
      ? { productUnit: createProductUnitAppHref(job.productUnit.id) }
      : {}),
    // A Stock Build has no sale behind it, so there is no Quote to link to.
    ...(job.quoteId && hasPermission(access, 'equipment_quote:read') ? { quote: createQuoteAppHref(job.quoteId) } : {}),
  });
}
