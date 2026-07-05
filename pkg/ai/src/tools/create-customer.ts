import * as core from '@pkg/core';
import {
  type AiToolBase,
  type Customer,
  CustomerCompanyName,
  CustomerCreateInput,
  NullableThumbnailDataUrl,
} from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../context.js';
import { requireActorSession } from './actor.js';
import { toAiToolJsonSchema } from './json-schema.js';

const CreateCustomerInput = z.strictObject({
  address: z.string().nullable().optional(),
  companyName: CustomerCompanyName,
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

    return core.createCustomer({ actorUserId: requireActorSession(ctx).user.id, db: ctx.db, input });
  },
};
