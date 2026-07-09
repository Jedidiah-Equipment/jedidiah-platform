import * as core from '@pkg/core';
import { type AiToolBase, type JobDetail, UUID } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { requireActorSession } from '../actor.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectJobDetail } from '../projections.js';

// Bay seeding is board-UI territory; the AI tool creates the Job unscheduled (empty baySeeds).
const CreateJobFromQuoteInput = z.strictObject({
  quoteId: UUID,
});

type CreateJobFromQuoteInput = z.infer<typeof CreateJobFromQuoteInput>;

export type CreateJobFromQuoteTool = AiToolBase<'createJobFromQuote', JobDetail, CreateJobFromQuoteInput, AiContext>;

export const createJobFromQuoteTool: CreateJobFromQuoteTool = {
  name: 'createJobFromQuote',
  inputSchema: CreateJobFromQuoteInput,
  jsonSchema: toAiToolJsonSchema(CreateJobFromQuoteInput),
  requiredPermission: 'job:create',
  async handler(args: unknown, ctx: AiContext) {
    const { quoteId } = CreateJobFromQuoteInput.parse(args);
    return core.createJob({
      actorUserId: requireActorSession(ctx).user.id,
      brochureRenderer: ctx.brochureRenderer,
      db: ctx.db,
      input: { baySeeds: [], quoteId },
      storage: ctx.storage,
    });
  },
};

export const createJobFromQuoteDefinition: AiToolDefinition<CreateJobFromQuoteTool> = {
  kind: 'write',
  tool: createJobFromQuoteTool,
  descriptor: {
    purpose: 'Create the production Job for an eligible Quote.',
    useWhen: ['The user explicitly asks to create the Job for a specific, already-identified Quote.'],
    doNotUseWhen: ['The Quote is not yet identified; find it with listQuotes or getQuote first.'],
    resultIdentifiers: ['Job Code', 'Quote Kind', 'Customer company name', 'Product name / Custom Work Title'],
    linkTarget: aiLinkMetadata.Job,
  },
  projectResult: projectJobDetail,
};
