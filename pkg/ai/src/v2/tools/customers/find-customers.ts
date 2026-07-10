import * as customersCore from '@pkg/core';
import { Customer, CustomerListInput, type CustomerListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';
import { createCustomerAppHref, InternalAppHref } from '@/v2/entity-links.js';

export type FindCustomersInput = z.infer<typeof FindCustomersInput>;
export const FindCustomersInput = CustomerListInput.pick({ search: true }).strict();

const FindCustomerItem = Customer.pick({
  companyName: true,
  contactPerson: true,
  email: true,
  id: true,
  phone: true,
  vatNumber: true,
}).extend({ links: z.object({ app: InternalAppHref }) });

export type FindCustomersResponse = z.infer<typeof FindCustomersResponse>;
export const FindCustomersResponse = z.array(FindCustomerItem);

export function toCoreCustomerListInput(input: FindCustomersInput): CustomerListInput {
  return {
    columnFilters: {},
    page: 1,
    pageSize: 0,
    search: input.search,
    sortBy: 'companyName',
    sortDirection: 'asc',
  };
}

export function toFindCustomersResponse(result: CustomerListResult): FindCustomersResponse {
  return result.items.map((customer) => ({
    companyName: customer.companyName,
    contactPerson: customer.contactPerson,
    email: customer.email,
    id: customer.id,
    links: { app: createCustomerAppHref(customer.id) },
    phone: customer.phone,
    vatNumber: customer.vatNumber,
  }));
}

export const findCustomersDefinition = {
  name: 'findCustomers',
  description: [
    'Search for Customers by company name, email, VAT number, or UUID.',
    'Returns lightweight matches containing Customer identity, contact fields, and links.app.',
    'Call getCustomer with the selected id when full Customer details are needed.',
  ].join('\n'),
  inputSchema: FindCustomersInput,
  outputSchema: FindCustomersResponse,
  requiredPermission: 'customer:read',
  async handler(args: unknown, ctx: AiV2Context): Promise<FindCustomersResponse> {
    const input = FindCustomersInput.parse(args ?? {});
    const result = await customersCore.listCustomers({ db: ctx.db, input: toCoreCustomerListInput(input) });
    return toFindCustomersResponse(result);
  },
} as const;
