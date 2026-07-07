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
    useWhen: [
      'Searching by Part code, name, category, supplier, unit of measure, internal fabrication flag, UUID, or partial text.',
    ],
    doNotUseWhen: ['A Part id is already known and the user needs one Part record; use getPart instead.'],
    searchableIdentifiers: [
      'Part UUID',
      'Part code',
      'Part name',
      'Part category',
      'isInternallyFabricated',
      'supplier name',
      'supplier code',
      'unitOfMeasure',
    ],
    resultIdentifiers: ['Part code', 'Part name', 'Supplier company name', 'unitOfMeasure', 'isInternallyFabricated'],
  },
  projectResult: projectPartList,
};
