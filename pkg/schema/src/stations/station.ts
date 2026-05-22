import { z } from 'zod';

import { Department } from '../auth/authorization.js';
import { UUID } from '../common/uuid.js';

export type StationName = z.infer<typeof StationName>;
export const StationName = z.string().trim().min(1, 'Station name is required');

export type StationDisplayOrder = z.infer<typeof StationDisplayOrder>;
export const StationDisplayOrder = z.coerce.number().int().min(0);

export type Station = z.infer<typeof Station>;
export const Station = z.object({
  id: UUID,
  name: StationName,
  department: Department,
  isActive: z.boolean(),
  displayOrder: StationDisplayOrder,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type StationListInput = z.infer<typeof StationListInput>;
export const StationListInput = z
  .object({
    department: Department.optional(),
    isActive: z.boolean().optional(),
  })
  .default({});

export type StationCreateInput = z.infer<typeof StationCreateInput>;
export const StationCreateInput = z.object({
  department: Department,
  displayOrder: StationDisplayOrder.default(0),
  name: StationName,
});

export type StationUpdateInput = z.infer<typeof StationUpdateInput>;
export const StationUpdateInput = z.object({
  id: UUID,
  displayOrder: StationDisplayOrder,
  name: StationName,
});

export type StationSetActiveInput = z.infer<typeof StationSetActiveInput>;
export const StationSetActiveInput = z.object({
  id: UUID,
  isActive: z.boolean(),
});
