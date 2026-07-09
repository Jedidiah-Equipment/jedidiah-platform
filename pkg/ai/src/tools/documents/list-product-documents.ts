import * as core from '@pkg/core';
import { type AiToolBase, DocumentListByProductInput, type ProductDocument } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectDocumentList } from '../projections.js';

export type ListProductDocumentsTool = AiToolBase<
  'listProductDocuments',
  ProductDocument[],
  DocumentListByProductInput,
  AiContext
>;

export const listProductDocumentsTool: ListProductDocumentsTool = {
  name: 'listProductDocuments',
  inputSchema: DocumentListByProductInput,
  jsonSchema: toAiToolJsonSchema(DocumentListByProductInput),
  requiredPermission: 'product:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = DocumentListByProductInput.parse(args);
    return core.getProductDocuments({ db: ctx.db, productId: input.productId });
  },
};

export const listProductDocumentsDefinition: AiToolDefinition<ListProductDocumentsTool> = {
  kind: 'read',
  tool: listProductDocumentsTool,
  descriptor: {
    purpose: 'List the Documents attached to a Product.',
    useWhen: ['The user asks what documents a specific Product has.'],
    resultIdentifiers: ['document type', 'filename', 'created date'],
  },
  projectResult: projectDocumentList,
};
