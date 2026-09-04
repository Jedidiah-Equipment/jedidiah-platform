import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { UUID } from '../../common/uuid.js';
import { WorkItemDepartment } from '../common/departments.js';

export type ProductBuildMetricsInput = z.infer<typeof ProductBuildMetricsInput>;
export const ProductBuildMetricsInput = z.object({ productId: UUID, department: WorkItemDepartment });

/**
 * What a Product's Build Jobs actually took in one Department, live-computed from Department Timing
 * stamps and never stored. Only Build Jobs with both stamps count, so both figures start empty and
 * accumulate — there is no history to backfill.
 */
export type ProductBuildMetrics = z.infer<typeof ProductBuildMetrics>;
export const ProductBuildMetrics = z.object({
  averageWorkingDays: z.number().nullable(),
  buildCount: z.number().int(),
  builds: z.array(
    z.object({
      jobId: UUID,
      jobCode: z.number().int(),
      productSerialNumber: z.string(),
      actualWorkingDays: z.number().int(),
      /** Sum of this department's slot durationDays; null when the Job holds none. */
      scheduledWorkingDays: z.number().int().nullable(),
      crewSize: z.number().int(),
      completedAt: DateIso,
    }),
  ),
  /** Null for callers without equipment_job_metrics:read — partial response, same pattern as jobs.get documents. */
  ranking: z
    .array(
      z.object({
        userId: AuthId,
        name: z.string(),
        averageWorkingDays: z.number(),
        buildCount: z.number().int(),
        averageCrewSize: z.number(),
      }),
    )
    .nullable(),
});
