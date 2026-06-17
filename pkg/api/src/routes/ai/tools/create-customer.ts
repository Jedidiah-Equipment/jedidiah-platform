import * as core from '@pkg/core';
import { type AiToolBase, type Customer, CustomerCreateInput, NullableThumbnailDataUrl } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';
import { toAiToolJsonSchema } from './json-schema.js';

const CreateCustomerInput = z.strictObject({
  address: z.string().nullable().optional(),
  companyName: z.string().min(1),
  contactPerson: z.string().nullable().optional(),
  email: z.email().nullable().optional(),
  notes: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  thumbnailDataUrl: NullableThumbnailDataUrl.optional(),
  vatNumber: z.string().nullable().optional(),
});

type CreateCustomerInput = z.infer<typeof CreateCustomerInput>;

export type CreateCustomerTool = AiToolBase<'createCustomer', Customer, CreateCustomerInput, AiContext>;

export const createCustomerTool: CreateCustomerTool = {
  name: 'createCustomer',
  inputSchema: CreateCustomerInput,
  jsonSchema: toAiToolJsonSchema(CreateCustomerInput),
  requiredPermission: 'customer:create',
  async handler(args: unknown, ctx: AiContext) {
    const rawInput = CreateCustomerInput.parse(args);
    const input = CustomerCreateInput.parse({
      address: rawInput.address ?? null,
      companyName: rawInput.companyName,
      contactPerson: rawInput.contactPerson ?? null,
      email: rawInput.email ?? null,
      notes: rawInput.notes ?? null,
      phone: rawInput.phone ?? null,
      thumbnailDataUrl: rawInput.thumbnailDataUrl ?? null,
      vatNumber: rawInput.vatNumber ?? null,
    });
    const actorUserId = getActorUserId(ctx);

    return core.createCustomer({ actorUserId, db: ctx.db, input });
  },
};

function getActorUserId(ctx: AiContext): string {
  if (!ctx.session) {
    throw new Error('AI write tools require an authenticated user.');
  }

  return ctx.session.user.id;
}
