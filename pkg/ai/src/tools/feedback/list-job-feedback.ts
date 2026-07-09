import * as core from '@pkg/core';
import { type AiToolBase, JobFeedbackListInput, type JobFeedbackListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';

export type ListJobFeedbackTool = AiToolBase<'listJobFeedback', JobFeedbackListResult, JobFeedbackListInput, AiContext>;

export const listJobFeedbackTool: ListJobFeedbackTool = {
  name: 'listJobFeedback',
  inputSchema: JobFeedbackListInput,
  jsonSchema: toAiToolJsonSchema(JobFeedbackListInput),
  requiredPermission: 'job:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = JobFeedbackListInput.parse(args);
    return core.listJobFeedback({ db: ctx.db, input });
  },
};

export const listJobFeedbackDefinition: AiToolDefinition<ListJobFeedbackTool> = {
  kind: 'read',
  tool: listJobFeedbackTool,
  descriptor: {
    purpose: "List a Job's general feedback.",
    useWhen: ['The user asks about feedback or issues raised on a specific Job.'],
    resultIdentifiers: ['feedback status', 'submitter name', 'feedback text', 'submitted date'],
  },
  projectResult: identityProjection,
};
