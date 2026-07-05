import * as core from '@pkg/core';
import { type AiToolBase, type JobDetail, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

const GetJobInput = z.object({
  id: UUID,
});

type GetJobInput = z.infer<typeof GetJobInput>;

export type GetJobTool = AiToolBase<'getJob', JobDetail, GetJobInput, AiContext>;

export const getJobTool: GetJobTool = {
  name: 'getJob',
  inputSchema: GetJobInput,
  jsonSchema: toAiToolJsonSchema(GetJobInput),
  requiredPermission: 'job:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = GetJobInput.parse(args);
    // Defense-in-depth: fail fast if a caller bypasses the registry's `job:read` gating.
    if (!ctx.access) {
      throw new Error('Tool requires authenticated access.');
    }
    return core.getJob({ db: ctx.db, id: input.id });
  },
};
