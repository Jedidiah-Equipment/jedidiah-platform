import * as core from '@pkg/core';
import { type AiToolBase, QuoteProductBayAvailabilityInput, type QuoteProductBayAvailabilityResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';

export type GetQuoteProductBayAvailabilityTool = AiToolBase<
  'getQuoteProductBayAvailability',
  QuoteProductBayAvailabilityResult,
  QuoteProductBayAvailabilityInput,
  AiContext
>;

export const getQuoteProductBayAvailabilityTool: GetQuoteProductBayAvailabilityTool = {
  name: 'getQuoteProductBayAvailability',
  inputSchema: QuoteProductBayAvailabilityInput,
  jsonSchema: toAiToolJsonSchema(QuoteProductBayAvailabilityInput),
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = QuoteProductBayAvailabilityInput.parse(args);
    return core.getQuoteProductBayAvailability({ db: ctx.db, input });
  },
};

export const getQuoteProductBayAvailabilityDefinition: AiToolDefinition<GetQuoteProductBayAvailabilityTool> = {
  kind: 'read',
  tool: getQuoteProductBayAvailabilityTool,
  descriptor: {
    purpose: 'Check Bay availability for building a quoted Product (earliest feasible build window per Bay).',
    useWhen: ['During a quoting conversation the user asks when a quoted Product could be built.'],
    doNotUseWhen: ['The Quote is a Custom Quote with no Product; this applies to Product Quotes only.'],
    resultIdentifiers: [
      'Bay name and Department',
      'next available date per Bay',
      'wait working days',
      'build time days',
    ],
  },
  projectResult: identityProjection,
};
