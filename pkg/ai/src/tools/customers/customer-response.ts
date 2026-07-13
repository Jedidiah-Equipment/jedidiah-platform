import { Customer } from '@pkg/schema';
import { z } from 'zod';

import { createCustomerAppHref, InternalAppHref } from '@/entity-links.js';

export type CustomerResponse = z.infer<typeof CustomerResponse>;
export const CustomerResponse = Customer.pick({
  address: true,
  companyName: true,
  contactPerson: true,
  createdAt: true,
  email: true,
  id: true,
  notes: true,
  phone: true,
  updatedAt: true,
  vatNumber: true,
}).extend({ links: z.object({ app: InternalAppHref }) });

export function toCustomerResponse(customer: Customer): CustomerResponse {
  return CustomerResponse.parse({
    ...customer,
    links: { app: createCustomerAppHref(customer.id) },
  });
}
