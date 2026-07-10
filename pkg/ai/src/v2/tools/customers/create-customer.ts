import * as customersCore from '@pkg/core';
import {
  CustomerCreateInput as CoreCustomerCreateInput,
  type CustomerCreateInput as CoreCustomerCreateInputType,
  type Customer,
  CustomerCompanyName,
  CustomerEmail,
  CustomerOptionalText,
  CustomerVatNumber,
} from '@pkg/schema';
import { z } from 'zod';

import { requireAiV2ActorId } from '@/v2/actor.js';
import type { AiV2Context } from '@/v2/context.js';

import {
  CustomerResponse as SharedCustomerResponse,
  type CustomerResponse as SharedCustomerResponseType,
  toCustomerResponse,
} from './customer-response.js';

export type CreateCustomerInput = z.infer<typeof CreateCustomerInput>;
export const CreateCustomerInput = z
  .object({
    address: CustomerOptionalText.default(null),
    companyName: CustomerCompanyName,
    contactPerson: CustomerOptionalText.default(null),
    email: CustomerEmail.nullable().default(null),
    notes: CustomerOptionalText.default(null),
    phone: CustomerOptionalText.default(null),
    vatNumber: CustomerVatNumber.default(null),
  })
  .strict();

export type CreateCustomerResponse = SharedCustomerResponseType;
export const CreateCustomerResponse = SharedCustomerResponse;

export function toCoreCustomerCreateInput(input: CreateCustomerInput): CoreCustomerCreateInputType {
  return CoreCustomerCreateInput.parse({ ...input, thumbnailDataUrl: null });
}

export function toCreateCustomerResponse(customer: Customer): CreateCustomerResponse {
  return toCustomerResponse(customer);
}

export const createCustomerDefinition = {
  name: 'createCustomer',
  description: [
    'Create one standalone Customer record.',
    'Use only when the user explicitly asks to add a Customer outside a Quote workflow.',
    'When creating a Quote for a new company, use createQuote with an inline Customer instead.',
    'Returns the created Customer details and links.app without thumbnail data.',
  ].join('\n'),
  inputSchema: CreateCustomerInput,
  outputSchema: CreateCustomerResponse,
  anyOfPermissions: ['customer:create'],
  async handler(args: unknown, ctx: AiV2Context): Promise<CreateCustomerResponse> {
    const input = toCoreCustomerCreateInput(CreateCustomerInput.parse(args));
    const customer = await customersCore.createCustomer({
      actorUserId: requireAiV2ActorId(ctx),
      db: ctx.db,
      input,
    });
    return toCreateCustomerResponse(customer);
  },
} as const;
