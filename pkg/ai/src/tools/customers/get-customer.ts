import * as customersCore from '@pkg/core';
import { type Customer, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '@/context.js';

import {
  CustomerResponse as SharedCustomerResponse,
  type CustomerResponse as SharedCustomerResponseType,
  toCustomerResponse,
} from './customer-response.js';

export type GetCustomerInput = z.infer<typeof GetCustomerInput>;
export const GetCustomerInput = z.object({ id: UUID }).strict();

export type GetCustomerResponse = SharedCustomerResponseType;
export const GetCustomerResponse = SharedCustomerResponse;

export function toGetCustomerResponse(customer: Customer): GetCustomerResponse {
  return toCustomerResponse(customer);
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
  anyOfPermissions: ['customer:read'],
  async handler(args: unknown, ctx: AiContext): Promise<GetCustomerResponse> {
    const input = GetCustomerInput.parse(args);
    const customer = await customersCore.getCustomer({ db: ctx.db, id: input.id });
    return toGetCustomerResponse(customer);
  },
} as const;
