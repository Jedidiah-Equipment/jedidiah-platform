import * as core from '@pkg/core';
import { type AiToolBase, type Customer, UUID } from '@pkg/schema';
import { z } from 'zod';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectCustomer } from '../projections.js';
import type { AiContext, AiToolDefinition } from '../tool-support.js';
import { aiLinkMetadata } from '../tool-support.js';

const GetCustomerInput = z.object({
  id: UUID,
});

type GetCustomerInput = z.infer<typeof GetCustomerInput>;

export type GetCustomerTool = AiToolBase<'getCustomer', Customer, GetCustomerInput, AiContext>;

export const getCustomerTool: GetCustomerTool = {
  name: 'getCustomer',
  inputSchema: GetCustomerInput,
  jsonSchema: toAiToolJsonSchema(GetCustomerInput),
  requiredPermission: 'customer:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = GetCustomerInput.parse(args);
    return core.getCustomer({ db: ctx.db, id: input.id });
  },
};

export const getCustomerDefinition: AiToolDefinition<GetCustomerTool> = {
  kind: 'read',
  tool: getCustomerTool,
  descriptor: {
    purpose: 'Get one Customer by UUID.',
    useWhen: ['A Customer id is already known and the user needs that Customer record.'],
    doNotUseWhen: ['Searching by company name, email, or partial id; use listCustomers or listQuoteCustomers first.'],
    searchableIdentifiers: ['Customer UUID'],
    resultIdentifiers: ['Customer company name', 'Customer UUID', 'VAT number'],
    linkTarget: aiLinkMetadata.Customer,
  },
  projectResult: projectCustomer,
};
