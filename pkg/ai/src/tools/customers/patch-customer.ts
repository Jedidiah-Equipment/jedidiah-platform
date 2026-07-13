import * as customersCore from '@pkg/core';
import {
  CustomerPatchInput as CoreCustomerPatchInput,
  type CustomerPatchInput as CoreCustomerPatchInputType,
  type Customer,
  CustomerCompanyName,
  CustomerEmail,
  CustomerOptionalText,
  CustomerVatNumber,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { requireAiActorId } from '@/actor.js';
import type { AiContext } from '@/context.js';

import {
  CustomerResponse as SharedCustomerResponse,
  type CustomerResponse as SharedCustomerResponseType,
  toCustomerResponse,
} from './customer-response.js';

export type PatchCustomerInput = z.infer<typeof PatchCustomerInput>;
export const PatchCustomerInput = z
  .object({
    address: CustomerOptionalText.optional(),
    companyName: CustomerCompanyName.optional(),
    contactPerson: CustomerOptionalText.optional(),
    email: CustomerEmail.nullable().optional(),
    id: UUID,
    notes: CustomerOptionalText.optional(),
    phone: CustomerOptionalText.optional(),
    vatNumber: CustomerVatNumber.optional(),
  })
  .strict();

export type PatchCustomerResponse = SharedCustomerResponseType;
export const PatchCustomerResponse = SharedCustomerResponse;

export function toCoreCustomerPatchInput(input: PatchCustomerInput): CoreCustomerPatchInputType {
  return CoreCustomerPatchInput.parse(input);
}

export function toPatchCustomerResponse(customer: Customer): PatchCustomerResponse {
  return toCustomerResponse(customer);
}

export const patchCustomerDefinition = {
  name: 'patchCustomer',
  description: [
    'Patch one Customer, changing only the fields explicitly provided by the user.',
    'Use findCustomers first when the Customer UUID is not already known.',
    'Omitted fields remain unchanged; null clears a nullable field.',
    'Returns the updated Customer details and links.app without thumbnail data.',
  ].join('\n'),
  inputSchema: PatchCustomerInput,
  outputSchema: PatchCustomerResponse,
  anyOfPermissions: ['customer:update'],
  async handler(args: unknown, ctx: AiContext): Promise<PatchCustomerResponse> {
    const input = toCoreCustomerPatchInput(PatchCustomerInput.parse(args));
    const customer = await customersCore.patchCustomer({
      actorUserId: requireAiActorId(ctx),
      db: ctx.db,
      input,
    });
    return toPatchCustomerResponse(customer);
  },
} as const;
