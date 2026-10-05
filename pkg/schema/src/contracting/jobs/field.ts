import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { Implement } from '../fleet/fleet.js';
import { FieldReading } from '../readings/reading.js';
import { assignmentIdentityShape, jobIdentityShape } from './job.js';

export const FieldStint = z.object({
  ...assignmentIdentityShape,
  arrival: FieldReading.nullable(),
  departure: FieldReading.nullable(),
});
export type FieldStint = z.infer<typeof FieldStint>;

export const FieldJob = z.object({ ...jobIdentityShape, stints: FieldStint.array() });
export type FieldJob = z.infer<typeof FieldJob>;

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
