import * as core from '@pkg/core';
import { type AiToolBase, FeedbackSubjectInput, type FeedbackSubmitResult, FeedbackText, UUID } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { requireActorSession } from '../actor.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';

// v1 exposes only the `general` feedback variant. The subject is flattened into a single object
// (subjectType + optional quoteId/jobId) rather than a discriminated union so the tool JSON schema
// stays within the OpenAI strict subset, matching the createQuote pattern. Corrective-feedback
// targeting (departments/users) stays out of the LLM's reach; the handler pins `kind: 'general'`.
const SubmitFeedbackInput = z
  .strictObject({
    subjectType: z.enum(['quote', 'job']),
    quoteId: UUID.optional(),
    jobId: UUID.optional(),
    text: FeedbackText,
  })
  .describe('Submit general feedback: subjectType job requires jobId; subjectType quote requires quoteId.')
  // Require the id that matches `subjectType` and reject the other, so a mismatched id is a visible
  // error rather than being silently ignored when the handler builds the subject. (Refinements do not
  // affect the emitted JSON schema, so this stays within the OpenAI strict subset.)
  .superRefine((value, ctx) => {
    if (value.subjectType === 'quote') {
      if (value.quoteId === undefined) {
        ctx.addIssue({ code: 'custom', path: ['quoteId'], message: 'quoteId is required when subjectType is quote.' });
      }
      if (value.jobId !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['jobId'], message: 'jobId must be omitted when subjectType is quote.' });
      }
      return;
    }

    if (value.jobId === undefined) {
      ctx.addIssue({ code: 'custom', path: ['jobId'], message: 'jobId is required when subjectType is job.' });
    }
    if (value.quoteId !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['quoteId'], message: 'quoteId must be omitted when subjectType is job.' });
    }
  });

type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackInput>;

export type SubmitFeedbackTool = AiToolBase<'submitFeedback', FeedbackSubmitResult, SubmitFeedbackInput, AiContext>;

export const submitFeedbackTool: SubmitFeedbackTool = {
  name: 'submitFeedback',
  inputSchema: SubmitFeedbackInput,
  jsonSchema: toAiToolJsonSchema(SubmitFeedbackInput),
  // Session-only gate: the API route is a protectedProcedure with no permission requirement.
  requiredPermission: null,
  async handler(args: unknown, ctx: AiContext) {
    const parsed = SubmitFeedbackInput.parse(args);
    const subject = FeedbackSubjectInput.parse(
      parsed.subjectType === 'quote'
        ? { subjectType: 'quote', quoteId: parsed.quoteId }
        : { subjectType: 'job', jobId: parsed.jobId },
    );

    return core.submitFeedback({
      db: ctx.db,
      input: { kind: 'general', subject, text: parsed.text },
      submitterId: requireActorSession(ctx).user.id,
    });
  },
};

export const submitFeedbackDefinition: AiToolDefinition<SubmitFeedbackTool> = {
  kind: 'write',
  tool: submitFeedbackTool,
  descriptor: {
    purpose: 'Submit general Feedback about a Job or Quote.',
    useWhen: ['The user explicitly asks to log general feedback against a specific Job or Quote.'],
    doNotUseWhen: ['Recording corrective feedback aimed at a department or user; that is not supported here.'],
    resultIdentifiers: ['Feedback UUID'],
  },
  projectResult: identityProjection,
};
