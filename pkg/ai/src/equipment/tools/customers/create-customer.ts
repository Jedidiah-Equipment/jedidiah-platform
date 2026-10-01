import * as customersCore from '@pkg/core/equipment';
import {
  CustomerCreateInput as CoreCustomerCreateInput,
  type CustomerCreateInput as CoreCustomerCreateInputType,
  type Customer,
  CustomerCompanyName,
  CustomerEmail,
  CustomerOptionalText,
  CustomerVatNumber,
} from '@pkg/schema/equipment';
import { z } from 'zod';
import { requireAiActorId } from '@/equipment/actor.js';
import type { AiContext } from '@/equipment/context.js';
import { CustomerMatchResponse, toCustomerMatchResponse } from '@/equipment/tools/customers/customer-match-response.js';

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
    allowPossibleMatch: z
      .boolean()
      .optional()
      .describe('Set true only when the user explicitly says a possible match is a different company.'),
    contactPerson: CustomerOptionalText.default(null),
    email: CustomerEmail.nullable().default(null),
    notes: CustomerOptionalText.default(null),
    phone: CustomerOptionalText.default(null),
    vatNumber: CustomerVatNumber.default(null),
  })
  .strict();

export type CreateCustomerResponse = SharedCustomerResponseType | CustomerMatchResponse;
export const CreateCustomerResponse = z.union([SharedCustomerResponse, CustomerMatchResponse]);

export function toCoreCustomerCreateInput(input: CreateCustomerInput): CoreCustomerCreateInputType {
  return CoreCustomerCreateInput.parse({ ...input, thumbnailDataUrl: null });
}

export function toCreateCustomerResponse(customer: Customer): SharedCustomerResponseType {
  return toCustomerResponse(customer);
}

export const createCustomerDefinition = {
  name: 'createCustomer',
  description: [
    'If creation returns possible_match, tell the user and use the existing Customer unless they say it is a different company. Ask which one when several match; never set allowPossibleMatch merely to retry.',
    'Create one standalone Customer record.',
    'Use only when the user explicitly asks to add a Customer outside a Quote workflow.',
    'When creating a Quote for a new company, use createQuote with an inline Customer instead.',
    'Returns the created Customer details and links.app without thumbnail data.',
  ].join('\n'),
  inputSchema: CreateCustomerInput,
  outputSchema: CreateCustomerResponse,
  anyOfPermissions: ['equipment_customer:create'],
  async handler(args: unknown, ctx: AiContext): Promise<CreateCustomerResponse> {
    const input = toCoreCustomerCreateInput(CreateCustomerInput.parse(args));
    try {
      const customer = await customersCore.createCustomer({
        actorUserId: requireAiActorId(ctx),
        db: ctx.db,
        input,
      });
      return toCreateCustomerResponse(customer);
    } catch (error) {
      if (error instanceof customersCore.CustomerPossibleMatchError)
        return toCustomerMatchResponse(error.metadata.matches);
      throw error;
    }
  },
} as const;
