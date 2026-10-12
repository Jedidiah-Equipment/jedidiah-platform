import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { Implement } from '../fleet/fleet.js';

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
