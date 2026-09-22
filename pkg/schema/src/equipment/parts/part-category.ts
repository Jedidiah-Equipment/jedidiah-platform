import { z } from 'zod';

import { DateIso } from '../../common/date.js';
import { requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';

/**
 * Inner runs of whitespace collapse to one space, so the name the unique index sees (casing folded)
 * and the name a CSV cell is matched by (casing and whitespace folded) can never name two categories.
 */
export type PartCategoryName = z.infer<typeof PartCategoryName>;
export const PartCategoryName = requiredTrimmedText('Part Category name is required').overwrite((name) =>
  name.replaceAll(/[ \t\n\r\f\v]+/g, ' '),
);

/** Markup on cost: a sell price is the cost times `1 + markup / 100`, so it may exceed 100. */
export type PartCategoryMarkupPercent = z.infer<typeof PartCategoryMarkupPercent>;
export const PartCategoryMarkupPercent = z
  .number()
  .min(0, 'Markup cannot be negative')
  .max(9999.99)
  .multipleOf(0.01, 'Use at most 2 decimal places');

/** What a picker needs: the id a Part stores and the name a person reads. */
export type PartCategoryOption = z.infer<typeof PartCategoryOption>;
export const PartCategoryOption = z.object({ id: UUID, name: PartCategoryName });

/** A Part Category as its admin page shows it. */
export type PartCategory = z.infer<typeof PartCategory>;
export const PartCategory = PartCategoryOption.extend({
  createdAt: DateIso,
  markupPercent: PartCategoryMarkupPercent.nullable(),
  partCount: z.number().int().nonnegative(),
  updatedAt: DateIso,
});

export type PartCategoryCreateInput = z.infer<typeof PartCategoryCreateInput>;
export const PartCategoryCreateInput = z.object({ name: PartCategoryName }).strict();

export type PartCategoryUpdateInput = z.infer<typeof PartCategoryUpdateInput>;
export const PartCategoryUpdateInput = z
  .object({ id: UUID, markupPercent: PartCategoryMarkupPercent.nullable(), name: PartCategoryName })
  .strict();
