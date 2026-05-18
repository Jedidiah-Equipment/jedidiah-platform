import * as core from '@pkg/core';
import { type AiToolBase, JobListInput, type JobListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListJobsTool = AiToolBase<'listJobs', JobListResult, JobListInput, AiContext>;

export const listJobsTool: ListJobsTool = {
  name: 'listJobs',
  description:
    'List jobs. Use filters.lifecycleStatuses to choose active, paused, complete, cancelled, or an empty array for all statuses. Use search for job UUIDs, partial UUIDs, numeric job codes, or public job codes such as JOB-00001. Use sortBy, sortDirection, page, and pageSize to return the right job slice.',
  inputSchema: JobListInput,
  jsonSchema: z.toJSONSchema(JobListInput) as Record<string, unknown>,
  requiredPermission: 'job:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = JobListInput.parse(args ?? {});
    // Job shaping depends on the typed access summary, so fail fast if a caller bypasses registry gating.
    if (!ctx.access) {
      throw new Error('Tool requires authenticated access.');
    }
    return core.listJobs({ access: ctx.access, db: ctx.db, input });
  },
};
