import { z } from 'zod';
import { UUID } from '../../common/uuid.js';
import { breakdownStatuses, breakdownUrgencies } from './breakdown-enums.js';

/**
 * One unsolved Breakdown as a Job or Machine row flags it: enough to draw the flag, read it on hover and open it. Kept
 * apart from `BreakdownSummary`, which imports the Job and fleet shapes that carry this one.
 */
export const OpenBreakdown = z.object({
  id: UUID,
  urgency: z.enum(breakdownUrgencies),
  status: z.enum(breakdownStatuses),
  subjectCode: z.string(),
  firstLine: z.string(),
});
export type OpenBreakdown = z.infer<typeof OpenBreakdown>;
