import * as core from '@pkg/core';
import { type AiToolBase, JobListInput, type JobListResult } from '@pkg/schema';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

export type ListJobsTool = AiToolBase<'listJobs', JobListResult, JobListInput, AiContext>;

export const listJobsTool: ListJobsTool = {
  name: 'listJobs',
  inputSchema: JobListInput,
  jsonSchema: toAiToolJsonSchema(JobListInput),
  requiredPermission: 'job:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = JobListInput.parse(args ?? {});
    if (!ctx.access) {
      throw new Error('Tool requires authenticated access.');
    }
    return core.listJobs({ db: ctx.db, input });
  },
};
