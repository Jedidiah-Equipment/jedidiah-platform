import * as core from '@pkg/core';
import { type AiToolBase, JobListInput, type JobListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectJobListItem, projectPagedItems } from '../projections.js';

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

export const listJobsDefinition: AiToolDefinition<ListJobsTool> = {
  kind: 'read',
  tool: listJobsTool,
  descriptor: {
    purpose: 'List Product Jobs and Custom Jobs visible to Job readers.',
    useWhen: [
      'Searching by Job Code, Product Job serial number, Custom Job Work Title, numeric code, Job UUID, or partial UUID.',
    ],
    doNotUseWhen: [
      'The user needs Bay schedule detail, Product Job CFO parts, or Job Documents for one Job; call getJob after identifying the Job id.',
    ],
    searchableIdentifiers: [
      'Job UUID',
      'Job Code such as JOB-00001',
      'Product serial number for Product Jobs such as SG1836260009',
      'Custom Job Work Title',
      'numeric Job Code',
    ],
    resultIdentifiers: [
      'Job Code',
      'Quote Kind',
      'Product serial number (null for Custom Jobs)',
      'Customer company name',
      'Product name and Product model code (null for Custom Jobs)',
      'Work Title display fallback for Custom Jobs',
      'schedule summary when requested',
      'Quote Code',
    ],
    linkTarget: aiLinkMetadata.Job,
  },
  projectResult: (result) => projectPagedItems(result, projectJobListItem),
};
