import { PartCategoryName } from '@pkg/schema/equipment';
import { z } from 'zod';

export type PartCategoryFormValues = z.infer<typeof PartCategoryFormValues>;
export const PartCategoryFormValues = z.object({ name: PartCategoryName });
