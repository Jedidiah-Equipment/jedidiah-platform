import * as core from '@pkg/core';
import { type AiToolBase, type JobDetail, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

const GetJobInput = z.object({
  id: UUID,
});

type GetJobInput = z.infer<typeof GetJobInput>;

export type GetJobTool = AiToolBase<'getJob', JobDetail, GetJobInput, AiContext>;

export const getJobTool: GetJobTool = {
  name: 'getJob',
  description:
    'Get one job by its UUID, including visible stage details and workflow events for the caller. Use this only after a job id is known; use listJobs first when searching by JOB-00001-style code, numeric code, or partial id.',
  inputSchema: GetJobInput,
  jsonSchema: z.toJSONSchema(GetJobInput) as Record<string, unknown>,
  requiredPermission: 'job:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = GetJobInput.parse(args);
    if (!ctx.access) {
      throw new Error('Tool requires authenticated access.');
    }
    return core.getJob({ access: ctx.access, db: ctx.db, id: input.id });
  },
};
