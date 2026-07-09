import * as core from '@pkg/core';
import { type AiToolBase, type Customer, CustomerCompanyName, CustomerFieldUpdateInput, UUID } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { requireActorSession } from '../actor.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectCustomerDetail } from '../projections.js';

// Partial input: only fields the user wants to change. `undefined` leaves the current value untouched.
// The merge over the current record happens under the row lock in `core.updateCustomerFields`, so the
// model can neither null out unrelated fields nor revert a concurrent edit to an omitted field.
const UpdateCustomerInput = z.strictObject({
  id: UUID,
  companyName: CustomerCompanyName.optional(),
  address: z.string().nullable().optional(),
  contactPerson: z.string().nullable().optional(),
  email: z.email().nullable().optional(),
  notes: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  vatNumber: z.string().nullable().optional(),
});

type UpdateCustomerInput = z.infer<typeof UpdateCustomerInput>;

export type UpdateCustomerTool = AiToolBase<'updateCustomer', Customer, UpdateCustomerInput, AiContext>;

export const updateCustomerTool: UpdateCustomerTool = {
  name: 'updateCustomer',
  inputSchema: UpdateCustomerInput,
  jsonSchema: toAiToolJsonSchema(UpdateCustomerInput),
  requiredPermission: 'customer:update',
  async handler(args: unknown, ctx: AiContext) {
    const rawInput = UpdateCustomerInput.parse(args);
    const input = CustomerFieldUpdateInput.parse(rawInput);

    return core.updateCustomerFields({ actorUserId: requireActorSession(ctx).user.id, db: ctx.db, input });
  },
};

export const updateCustomerDefinition: AiToolDefinition<UpdateCustomerTool> = {
  kind: 'write',
  tool: updateCustomerTool,
  descriptor: {
    purpose: 'Update a Customer record, changing only the fields the user names.',
    useWhen: ['The user explicitly asks to change a specific Customer detail (e.g. fix the email or phone).'],
    doNotUseWhen: ['Creating a Customer (use createCustomer) or only reading one (use getCustomer).'],
    resultIdentifiers: ['Customer company name', 'Customer UUID', 'VAT number'],
    linkTarget: aiLinkMetadata.Customer,
  },
  projectResult: projectCustomerDetail,
};
