import * as jobsCore from '@pkg/core';
import { hasPermission } from '@pkg/domain';
import { JobListInput, type JobListResult, JobSummary, type UserAccessSummary } from '@pkg/schema';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';
import {
  createCustomerAppHref,
  createJobAppHref,
  createProductAppHref,
  createQuoteAppHref,
  InternalAppHref,
} from '@/v2/entity-links.js';

export type FindJobsInput = z.infer<typeof FindJobsInput>;
export const FindJobsInput = JobListInput.pick({ search: true }).strict();

const JobLinks = z.object({
  app: InternalAppHref,
  customer: InternalAppHref.optional(),
  product: InternalAppHref.optional(),
  quote: InternalAppHref.optional(),
});

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
    links: {
      app: createJobAppHref(job.id),
      ...(hasPermission(access, 'customer:read') ? { customer: createCustomerAppHref(job.customerId) } : {}),
      ...(job.productId && hasPermission(access, 'product:read')
        ? { product: createProductAppHref(job.productId) }
        : {}),
      ...(hasPermission(access, 'quote:read') ? { quote: createQuoteAppHref(job.quoteId) } : {}),
    },
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
  requiredPermission: ['job:read'],
  async handler(args: unknown, ctx: AiV2Context): Promise<FindJobsResponse> {
    const input = FindJobsInput.parse(args ?? {});
    const result = await jobsCore.listJobs({ db: ctx.db, input: toCoreJobListInput(input) });
    return toFindJobsResponse(result, ctx.access);
  },
} as const;
