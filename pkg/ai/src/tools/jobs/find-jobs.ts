import * as jobsCore from '@pkg/core';
import { JobListInput, type JobListResult, JobSummary, type UserAccessSummary } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '@/context.js';

import { createJobLinks, JobLinks } from './job-links.js';

export type FindJobsInput = z.infer<typeof FindJobsInput>;
export const FindJobsInput = JobListInput.pick({ search: true }).strict();

const FindJobItem = JobSummary.pick({
  code: true,
  createdAt: true,
  customerCompanyName: true,
  customerId: true,
  description: true,
  id: true,
  productId: true,
  productModelCode: true,
  productName: true,
  productSerialNumber: true,
  quoteCode: true,
  quoteId: true,
  quoteKind: true,
  workTitle: true,
}).extend({ links: JobLinks });

export type FindJobsResponse = z.infer<typeof FindJobsResponse>;
export const FindJobsResponse = z.array(FindJobItem);

export function toCoreJobListInput(input: FindJobsInput): JobListInput {
  return {
    columnFilters: {},
    filters: {},
    page: 1,
    pageSize: 0,
    search: input.search,
    sortBy: 'code',
    sortDirection: 'asc',
  };
}

export function toFindJobsResponse(result: JobListResult, access: UserAccessSummary | null): FindJobsResponse {
  return result.items.map((job) => ({
    code: job.code,
    createdAt: job.createdAt,
    customerCompanyName: job.customerCompanyName,
    customerId: job.customerId,
    description: job.description,
    id: job.id,
    links: createJobLinks(job, access),
    productId: job.productId,
    productModelCode: job.productModelCode,
    productName: job.productName,
    productSerialNumber: job.productSerialNumber,
    quoteCode: job.quoteCode,
    quoteId: job.quoteId,
    quoteKind: job.quoteKind,
    workTitle: job.workTitle,
  }));
}

export const findJobsDefinition = {
  name: 'findJobs',
  description: [
    'Search for Product Jobs or Custom Jobs by Job Code, Product serial number, Custom Work Title, or UUID.',
    'Returns lightweight identity and relationship matches with code-owned app links.',
    'Call getJob with the selected id when full Job details are needed.',
  ].join('\n'),
  inputSchema: FindJobsInput,
  outputSchema: FindJobsResponse,
  anyOfPermissions: ['job:read'],
  async handler(args: unknown, ctx: AiContext): Promise<FindJobsResponse> {
    const input = FindJobsInput.parse(args ?? {});
    const result = await jobsCore.listJobs({ db: ctx.db, input: toCoreJobListInput(input) });
    return toFindJobsResponse(result, ctx.access);
  },
} as const;
