import * as core from '@pkg/core';
import { type AiToolBase, type Customer, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

const GetCustomerInput = z.object({
  id: UUID,
});

type GetCustomerInput = z.infer<typeof GetCustomerInput>;

export type GetCustomerTool = AiToolBase<'getCustomer', Customer, GetCustomerInput, AiContext>;

export const getCustomerTool: GetCustomerTool = {
  name: 'getCustomer',
  description:
    'Get one customer by its UUID. Use this only after a customer id is known; use listCustomers first when searching by company name, email, or partial id.',
  inputSchema: GetCustomerInput,
  jsonSchema: z.toJSONSchema(GetCustomerInput) as Record<string, unknown>,
  requiredPermission: 'customer:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = GetCustomerInput.parse(args);
    return core.getCustomer({ db: ctx.db, id: input.id });
  },
};
