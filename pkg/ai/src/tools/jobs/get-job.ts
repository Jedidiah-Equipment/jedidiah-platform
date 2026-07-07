import * as core from '@pkg/core';
import { type AiToolBase, type JobDetail, UUID } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectJobDetail } from '../projections.js';

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

export const getJobDefinition: AiToolDefinition<GetJobTool> = {
  kind: 'read',
  tool: getJobTool,
  descriptor: {
    purpose:
      'Get one Product Job or Custom Job by UUID, including Bay schedule detail, Product Job CFO part quantities, and Job Documents.',
    useWhen: [
      'A Job id is already known and the user needs production progress, Bay schedule detail, Product Job CFO facts, or Job Documents.',
    ],
    doNotUseWhen: [
      'Searching by Job Code, Product Job serial number, Custom Job Work Title, numeric code, or partial id; use listJobs first.',
    ],
    searchableIdentifiers: ['Job UUID'],
    resultIdentifiers: [
      'Job Code',
      'Quote Kind',
      'Product serial number (null for Custom Jobs)',
      'Quote Code',
      'Customer company name',
      'Product name and Product model code (null for Custom Jobs)',
      'Work Title display fallback for Custom Jobs',
      'scheduled Department and Bay slots',
      'Product Job CFO Part quantities with unitOfMeasure (empty for Custom Jobs)',
      'Job Documents (Custom Jobs start without Product Document Snapshots or generated Brochures)',
    ],
    linkTarget: aiLinkMetadata.Job,
  },
  projectResult: projectJobDetail,
};
