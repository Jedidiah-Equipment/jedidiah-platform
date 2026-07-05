import * as core from '@pkg/core';
import {
  type AiToolBase,
  type Customer,
  CustomerCompanyName,
  CustomerCreateInput,
  NullableThumbnailDataUrl,
} from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { requireActorSession } from '../actor.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectCustomer } from '../projections.js';

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

export const createCustomerDefinition: AiToolDefinition<CreateCustomerTool> = {
  kind: 'write',
  tool: createCustomerTool,
  descriptor: {
    purpose: 'Create one standalone Customer record.',
    useWhen: ['The user explicitly asks to create or add a Customer record outside a Quote workflow.'],
    doNotUseWhen: [
      'A sales user is creating a Quote for a new company; use createQuote with an inline customer instead.',
      'The user only needs to search existing Customers; use listCustomers or listQuoteCustomers first.',
    ],
    searchableIdentifiers: ['companyName', 'email', 'VAT number'],
    resultIdentifiers: ['Customer company name', 'Customer UUID', 'VAT number'],
    linkTarget: aiLinkMetadata.Customer,
  },
  projectResult: projectCustomer,
};
