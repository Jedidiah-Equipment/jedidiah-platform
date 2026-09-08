import { z } from 'zod';
import { requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
export const WorkTypeName = requiredTrimmedText('Work type name is required');
export const WorkTypeCreateInput = z.object({ name: WorkTypeName }).strict();
export type WorkTypeCreateInput = z.infer<typeof WorkTypeCreateInput>;
export const WorkTypePatchInput = WorkTypeCreateInput.partial()
  .extend({ id: UUID, active: z.boolean().optional() })
  .strict();
export type WorkTypePatchInput = z.infer<typeof WorkTypePatchInput>;
export const WorkType = WorkTypeCreateInput.extend({ id: UUID, active: z.boolean() }).strip();
export type WorkType = z.infer<typeof WorkType>;
