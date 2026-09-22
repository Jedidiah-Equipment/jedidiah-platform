import { z } from 'zod';

import { DateIso } from '../../common/date.js';
import { requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';

export type PartCategoryName = z.infer<typeof PartCategoryName>;
export const PartCategoryName = requiredTrimmedText('Part Category name is required');

/** What a picker needs: the id a Part stores and the name a person reads. */
export type PartCategoryOption = z.infer<typeof PartCategoryOption>;
export const PartCategoryOption = z.object({ id: UUID, name: PartCategoryName });

/** A Part Category as its admin page shows it. */
export type PartCategory = z.infer<typeof PartCategory>;
export const PartCategory = PartCategoryOption.extend({
  createdAt: DateIso,
  partCount: z.number().int().nonnegative(),
  updatedAt: DateIso,
});

export type PartCategoryCreateInput = z.infer<typeof PartCategoryCreateInput>;
export const PartCategoryCreateInput = z.object({ name: PartCategoryName }).strict();

export type PartCategoryUpdateInput = z.infer<typeof PartCategoryUpdateInput>;
export const PartCategoryUpdateInput = z.object({ id: UUID, name: PartCategoryName }).strict();
