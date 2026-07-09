import * as core from '@pkg/core';
import { type AiToolBase, PartListInput, type PartListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectPartList } from '../projections.js';

export type ListPartsTool = AiToolBase<'listParts', PartListResult, PartListInput, AiContext>;

export const listPartsTool: ListPartsTool = {
  name: 'listParts',
  inputSchema: PartListInput,
  jsonSchema: toAiToolJsonSchema(PartListInput),
  requiredPermission: 'part:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = PartListInput.parse(args ?? {});
    return core.listParts({ db: ctx.db, input });
  },
};

export const listPartsDefinition: AiToolDefinition<ListPartsTool> = {
  kind: 'read',
  tool: listPartsTool,
  descriptor: {
    purpose: 'List Parts visible to Part readers.',
    useWhen: ['Searching Parts by free text.'],
    searchableIdentifiers: [
      'Part code',
      'Part name',
      'Part category',
      'description',
      'drawing code',
      'finish',
      'supplier code',
      'Supplier company name',
      'Part UUID',
    ],
    resultIdentifiers: ['Part code', 'Part name', 'Supplier company name', 'unitOfMeasure', 'isInternallyFabricated'],
  },
  projectResult: projectPartList,
};
