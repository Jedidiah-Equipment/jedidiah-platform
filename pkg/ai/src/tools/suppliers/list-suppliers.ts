import * as core from '@pkg/core';
import { type AiToolBase, SupplierListInput, type SupplierListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectSupplierList } from '../projections.js';

export type ListSuppliersTool = AiToolBase<'listSuppliers', SupplierListResult, SupplierListInput, AiContext>;

export const listSuppliersTool: ListSuppliersTool = {
  name: 'listSuppliers',
  inputSchema: SupplierListInput,
  jsonSchema: toAiToolJsonSchema(SupplierListInput),
  requiredPermission: 'supplier:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = SupplierListInput.parse(args ?? {});
    return core.listSuppliers({ db: ctx.db, input });
  },
};

export const listSuppliersDefinition: AiToolDefinition<ListSuppliersTool> = {
  kind: 'read',
  tool: listSuppliersTool,
  descriptor: {
    purpose: 'List Suppliers by free text.',
    useWhen: ['The user asks a supplier-centric question, such as a Supplier contact or all Suppliers by name.'],
    doNotUseWhen: ['Looking up which Supplier a Part comes from; Part results already carry the Supplier name.'],
    searchableIdentifiers: ['Supplier company name', 'Supplier email', 'Supplier UUID'],
    resultIdentifiers: ['Supplier company name', 'contact person', 'email', 'phone'],
  },
  projectResult: projectSupplierList,
};
