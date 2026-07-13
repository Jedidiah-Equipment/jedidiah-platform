import * as jobsCore from '@pkg/core';
import {
  BayOperator,
  JobDetail,
  JobDetailDepartmentSchedule,
  JobScheduleBayQueue,
  JobScheduleWorkSlot,
  type UserAccessSummary,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '@/context.js';

import { createJobLinks, JobLinks } from './job-links.js';

export type GetJobInput = z.infer<typeof GetJobInput>;
export const GetJobInput = z.object({ id: UUID }).strict();

const GetJobOperator = BayOperator.omit({ thumbnailDataUrl: true });
const GetJobScheduleSlot = JobScheduleWorkSlot.omit({ operator: true }).extend({
  operator: GetJobOperator.nullable(),
});
const GetJobScheduleBay = JobScheduleBayQueue.omit({ currentOperator: true, slots: true }).extend({
  currentOperator: GetJobOperator.nullable(),
  slots: z.array(GetJobScheduleSlot),
});
const GetJobDepartmentSchedule = JobDetailDepartmentSchedule.omit({ bays: true }).extend({
  bays: z.array(GetJobScheduleBay),
});

export type GetJobResponse = z.infer<typeof GetJobResponse>;
export const GetJobResponse = JobDetail.pick({
  cfo: true,
  code: true,
  createdAt: true,
  customerCompanyName: true,
  customerId: true,
  description: true,
  documents: true,
  id: true,
  productId: true,
  productModelCode: true,
  productName: true,
  productSerialNumber: true,
  quoteCode: true,
  quoteId: true,
  quoteKind: true,
  scheduleState: true,
  updatedAt: true,
  vinNumber: true,
  workTitle: true,
}).extend({
  links: JobLinks,
  schedule: z.array(GetJobDepartmentSchedule).length(5),
});

export function toGetJobResponse(job: JobDetail, access: UserAccessSummary | null): GetJobResponse {
  return GetJobResponse.parse({
    ...job,
    links: createJobLinks(job, access),
  });
}

export const getJobDefinition = {
  name: 'getJob',
  description: [
    'Get the full details for one Product Job or Custom Job by UUID.',
    'Use after findJobs identifies the Job the user means.',
    'Returns identifiers, Customer and Quote facts, schedule, CFO parts, documents, timestamps, and relationship links without thumbnail data.',
  ].join('\n'),
  inputSchema: GetJobInput,
  outputSchema: GetJobResponse,
  anyOfPermissions: ['job:read'],
  async handler(args: unknown, ctx: AiContext): Promise<GetJobResponse> {
    const input = GetJobInput.parse(args);
    const job = await jobsCore.getJob({ db: ctx.db, id: input.id });
    return toGetJobResponse(job, ctx.access);
  },
} as const;
