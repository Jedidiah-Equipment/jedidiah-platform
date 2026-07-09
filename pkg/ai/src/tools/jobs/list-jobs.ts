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
    useWhen: ['Searching Jobs by free text.'],
    searchableIdentifiers: ['Job Code (JOB- prefix ok)', 'Product serial number', 'Custom Job Work Title', 'Job UUID'],
    resultIdentifiers: [
      'Job Code',
      'Quote Kind',
      'Customer company name',
      'Product serial number',
      'Product name / Custom Work Title',
      'Product model code',
      'schedule summary when requested',
      'Quote Code',
    ],
    linkTarget: aiLinkMetadata.Job,
  },
  projectResult: (result) => projectPagedItems(result, projectJobListItem),
};
