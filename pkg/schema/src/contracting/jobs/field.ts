import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { UUID } from '../../common/uuid.js';
import { CategoryColour, CategoryIconKey, FleetCode, FleetName, Implement } from '../fleet/fleet.js';
import { FieldReading } from '../readings/reading.js';
import { assignmentStates, jobStatuses } from './job-enums.js';

export const FieldStint = z.object({
  id: UUID,
  jobId: UUID,
  machineId: UUID,
  machineCode: FleetCode,
  categoryName: FleetName,
  categoryIcon: CategoryIconKey,
  categoryColour: CategoryColour,
  implementId: UUID.nullable(),
  implementCode: FleetCode.nullable(),
  driverUserId: AuthId.nullable(),
  driverName: z.string().nullable(),
  state: z.enum(assignmentStates),
  arrival: FieldReading.nullable(),
  departure: FieldReading.nullable(),
  createdAt: DateIso,
});
export type FieldStint = z.infer<typeof FieldStint>;

export const FieldJob = z.object({
  id: UUID,
  code: z.number().int(),
  jobNumber: z.string(),
  status: z.enum(jobStatuses),
  customerName: z.string(),
  farmName: z.string(),
  workTypeName: z.string(),
  description: z.string().nullable(),
  foremanUserId: AuthId.nullable(),
  stints: FieldStint.array(),
});
export type FieldJob = z.infer<typeof FieldJob>;

/** `includeFinished` adds management's recently finished Jobs; a Foreman's phone only ever lists open ones. */
export const FieldJobsInput = z
  .object({ includeFinished: z.boolean().default(false) })
  .strict()
  .optional();
export type FieldJobsInput = z.infer<typeof FieldJobsInput>;

export const FieldImplement = Implement.pick({
  id: true,
  code: true,
  categoryId: true,
  categoryName: true,
  categoryIcon: true,
  categoryColour: true,
})
  .extend({ onSiteJobNumber: z.string().nullable() })
  .strip();
export type FieldImplement = z.infer<typeof FieldImplement>;

export const FieldDriver = z.object({ id: AuthId, name: z.string() });
export type FieldDriver = z.infer<typeof FieldDriver>;
