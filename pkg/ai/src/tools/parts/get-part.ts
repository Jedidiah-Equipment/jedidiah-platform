import * as core from '@pkg/core';
import { type AiToolBase, type Part, UUID } from '@pkg/schema';
import { z } from 'zod';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';
import type { AiContext, AiToolDefinition } from '../tool-support.js';

const GetPartInput = z.object({
  id: UUID,
});

type GetPartInput = z.infer<typeof GetPartInput>;

export type GetPartTool = AiToolBase<'getPart', Part, GetPartInput, AiContext>;

export const getPartTool: GetPartTool = {
  name: 'getPart',
  inputSchema: GetPartInput,
  jsonSchema: toAiToolJsonSchema(GetPartInput),
  requiredPermission: 'part:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = GetPartInput.parse(args);
    return core.getPart({ db: ctx.db, id: input.id });
  },
};

export const getPartDefinition: AiToolDefinition<GetPartTool> = {
  kind: 'read',
  tool: getPartTool,
  descriptor: {
    purpose: 'Get one Part by UUID, including its Supplier, unitOfMeasure, and isInternallyFabricated.',
    useWhen: [
      'A Part id is already known and the user needs the Part unit, internal fabrication flag, Supplier, or details.',
    ],
    doNotUseWhen: ['Searching by Part code, name, category, supplier, or partial id; use listParts first.'],
    searchableIdentifiers: ['Part UUID'],
    resultIdentifiers: ['Part code', 'Part name', 'Supplier company name', 'unitOfMeasure', 'isInternallyFabricated'],
  },
  projectResult: identityProjection,
};
