import * as core from '@pkg/core';
import { type AiToolBase, DocumentListByQuoteInput, type QuoteDocument } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectDocumentList } from '../projections.js';

export type ListQuoteDocumentsTool = AiToolBase<
  'listQuoteDocuments',
  QuoteDocument[],
  DocumentListByQuoteInput,
  AiContext
>;

export const listQuoteDocumentsTool: ListQuoteDocumentsTool = {
  name: 'listQuoteDocuments',
  inputSchema: DocumentListByQuoteInput,
  jsonSchema: toAiToolJsonSchema(DocumentListByQuoteInput),
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = DocumentListByQuoteInput.parse(args);
    return core.getQuoteDocuments({ db: ctx.db, quoteId: input.quoteId });
  },
};

export const listQuoteDocumentsDefinition: AiToolDefinition<ListQuoteDocumentsTool> = {
  kind: 'read',
  tool: listQuoteDocumentsTool,
  descriptor: {
    purpose: 'List the generated Documents attached to a Quote.',
    useWhen: ['The user asks what documents a specific Quote has.'],
    doNotUseWhen: ["Asking about a Job's documents; getJob already returns them."],
    resultIdentifiers: ['document revision', 'filename', 'created date'],
  },
  projectResult: projectDocumentList,
};
