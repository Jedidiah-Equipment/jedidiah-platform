import { hasPermission } from '@pkg/domain';
import {
  createCustomerAppHref,
  createJobAppHref,
  createProductAppHref,
  createQuoteAppHref,
  InternalAppHref,
  type UserAccessSummary,
} from '@pkg/schema';
import { z } from 'zod';

export type JobLinks = z.infer<typeof JobLinks>;
export const JobLinks = z.object({
  app: InternalAppHref,
  customer: InternalAppHref.optional(),
  product: InternalAppHref.optional(),
  quote: InternalAppHref.optional(),
});

export function createJobLinks(
  job: { customerId: string; id: string; productId: string | null; quoteId: string },
  access: UserAccessSummary | null,
): JobLinks {
  return JobLinks.parse({
    app: createJobAppHref(job.id),
    ...(hasPermission(access, 'customer:read') ? { customer: createCustomerAppHref(job.customerId) } : {}),
    ...(job.productId && hasPermission(access, 'product:read') ? { product: createProductAppHref(job.productId) } : {}),
    ...(hasPermission(access, 'quote:read') ? { quote: createQuoteAppHref(job.quoteId) } : {}),
  });
}
