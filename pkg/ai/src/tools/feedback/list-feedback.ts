import * as core from '@pkg/core';
import { type AiToolBase, FeedbackListInput, type FeedbackListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';

export type ListFeedbackTool = AiToolBase<'listFeedback', FeedbackListResult, FeedbackListInput, AiContext>;

export const listFeedbackTool: ListFeedbackTool = {
  name: 'listFeedback',
  inputSchema: FeedbackListInput,
  jsonSchema: {
    ...toAiToolJsonSchema(FeedbackListInput),
    required: [],
  },
  requiredPermission: 'feedback:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = FeedbackListInput.parse(args ?? {});
    return core.listFeedback({ db: ctx.db, input });
  },
};

export const listFeedbackDefinition: AiToolDefinition<ListFeedbackTool> = {
  kind: 'read',
  tool: listFeedbackTool,
  descriptor: {
    purpose: 'List Feedback across Jobs and Quotes, optionally filtered by status.',
    useWhen: ['The user asks about the cross-entity feedback queue (e.g. what open feedback exists).'],
    doNotUseWhen: ["Asking about one Job's feedback; use listJobFeedback."],
    resultIdentifiers: ['feedback kind', 'status', 'subject label', 'submitter name'],
  },
  projectResult: identityProjection,
};
