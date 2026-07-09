import * as core from '@pkg/core';
import { type AiToolBase, type Supplier, UUID } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectSupplier } from '../projections.js';

const GetSupplierInput = z.strictObject({ id: UUID });

type GetSupplierInput = z.infer<typeof GetSupplierInput>;

export type GetSupplierTool = AiToolBase<'getSupplier', Supplier, GetSupplierInput, AiContext>;

export const getSupplierTool: GetSupplierTool = {
  name: 'getSupplier',
  inputSchema: GetSupplierInput,
  jsonSchema: toAiToolJsonSchema(GetSupplierInput),
  requiredPermission: 'supplier:read',
  async handler(args: unknown, ctx: AiContext) {
    const { id } = GetSupplierInput.parse(args);
    return core.getSupplier({ db: ctx.db, id });
  },
};

export const getSupplierDefinition: AiToolDefinition<GetSupplierTool> = {
  kind: 'read',
  tool: getSupplierTool,
  descriptor: {
    purpose: 'Fetch one Supplier by UUID.',
    useWhen: ["A Supplier UUID is already known and the user needs that Supplier's contact details."],
    resultIdentifiers: ['Supplier company name', 'contact person', 'email', 'phone', 'address'],
  },
  projectResult: projectSupplier,
};
