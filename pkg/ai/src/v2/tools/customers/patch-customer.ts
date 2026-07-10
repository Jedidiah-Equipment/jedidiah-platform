import * as customersCore from '@pkg/core';
import {
  CustomerPatchInput as CoreCustomerPatchInput,
  type CustomerPatchInput as CoreCustomerPatchInputType,
  Customer,
  CustomerCompanyName,
  CustomerEmail,
  CustomerOptionalText,
  CustomerVatNumber,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { requireAiV2ActorId } from '@/v2/actor.js';
import type { AiV2Context } from '@/v2/context.js';
import { createCustomerAppHref, InternalAppHref } from '@/v2/entity-links.js';

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

export type PatchCustomerResponse = z.infer<typeof PatchCustomerResponse>;
export const PatchCustomerResponse = Customer.pick({
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

export function toCoreCustomerPatchInput(input: PatchCustomerInput): CoreCustomerPatchInputType {
  return CoreCustomerPatchInput.parse(input);
}

export function toPatchCustomerResponse(customer: Customer): PatchCustomerResponse {
  return PatchCustomerResponse.parse({
    ...customer,
    links: { app: createCustomerAppHref(customer.id) },
  });
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
  requiredPermission: 'customer:update',
  async handler(args: unknown, ctx: AiV2Context): Promise<PatchCustomerResponse> {
    const input = toCoreCustomerPatchInput(PatchCustomerInput.parse(args));
    const customer = await customersCore.patchCustomer({
      actorUserId: requireAiV2ActorId(ctx),
      db: ctx.db,
      input,
    });
    return toPatchCustomerResponse(customer);
  },
} as const;
