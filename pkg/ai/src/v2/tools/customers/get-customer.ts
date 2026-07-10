import * as customersCore from '@pkg/core';
import { Customer, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';
import { createCustomerAppHref, InternalAppHref } from '@/v2/entity-links.js';

export type GetCustomerInput = z.infer<typeof GetCustomerInput>;
export const GetCustomerInput = z.object({ id: UUID }).strict();

export type GetCustomerResponse = z.infer<typeof GetCustomerResponse>;
export const GetCustomerResponse = Customer.pick({
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

export function toGetCustomerResponse(customer: Customer): GetCustomerResponse {
  return GetCustomerResponse.parse({
    ...customer,
    links: { app: createCustomerAppHref(customer.id) },
  });
}

export const getCustomerDefinition = {
  name: 'getCustomer',
  description: [
    'Get the full details for one Customer by UUID.',
    'Use after findCustomers identifies the Customer the user means.',
    'Returns contact, address, VAT, notes, timestamps, and links.app details without thumbnail data.',
  ].join('\n'),
  inputSchema: GetCustomerInput,
  outputSchema: GetCustomerResponse,
  requiredPermission: 'customer:read',
  async handler(args: unknown, ctx: AiV2Context): Promise<GetCustomerResponse> {
    const input = GetCustomerInput.parse(args);
    const customer = await customersCore.getCustomer({ db: ctx.db, id: input.id });
    return toGetCustomerResponse(customer);
  },
} as const;
