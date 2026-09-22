import { z } from 'zod';

import { CursorQueryInput, createCursorQueryResult } from '../../common/pagination.js';
import { Price } from '../../common/price.js';
import { SearchText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
import {
  PartAverageUtilizationPercent,
  PartCode,
  PartName,
  PartStandardPurchaseLengthMm,
  PartUnitOfMeasure,
} from '../parts/part.js';
import { PartCategoryName } from '../parts/part-category.js';

export type QuoteInventoryPartPriceNote = z.infer<typeof QuoteInventoryPartPriceNote>;
export const QuoteInventoryPartPriceNote = z.enum(['no-cost', 'no-markup']);

/** A catalog Part as the Work Item's "Add inventory part" dialog offers it: a sell price, never a cost. */
export type QuoteInventoryPartOption = z.infer<typeof QuoteInventoryPartOption>;
export const QuoteInventoryPartOption = z.object({
  averageUtilizationPercent: PartAverageUtilizationPercent.nullable(),
  code: PartCode,
  /** Free Stock: on hand minus open Job commitments. Shown, never enforced. */
  freeQuantity: z.number().finite(),
  id: UUID,
  name: PartName,
  partCategoryName: PartCategoryName,
  /** Why there is no price. Null exactly when `sellPricePerBasisUnit` is a number. */
  priceNote: QuoteInventoryPartPriceNote.nullable(),
  /**
   * Moving average marked up by the Part Category, per costing basis unit: per millimetre for a
   * linear Part, per whole unit otherwise. A sell price, deliberately NOT an inventory cost field:
   * it must reach `sales`, who are cost-blind.
   */
  sellPricePerBasisUnit: Price.nullable(),
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable(),
  unitOfMeasure: PartUnitOfMeasure,
});

/** Not `.strict()`: tRPC's infinite query appends its own `direction` key to the page params. */
export type QuoteInventoryPartListInput = z.infer<typeof QuoteInventoryPartListInput>;
export const QuoteInventoryPartListInput = CursorQueryInput.extend({ search: SearchText });

export type QuoteInventoryPartListResult = z.infer<typeof QuoteInventoryPartListResult>;
export const QuoteInventoryPartListResult = createCursorQueryResult(QuoteInventoryPartOption);

/** How long a piece of a linear Part is being sold, in whole millimetres. */
export const QuoteInventoryPartLengthMm = z.int('Must be a whole number').positive('Must be 1 or greater');

/** Part area ÷ plate area, no waste. Two decimals, like any percentage typed into a Quote. */
export const QuoteInventoryPartPlatePercent = z
  .number()
  .positive('Must be greater than 0')
  .max(100, 'Must be 100 or less')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, 'Use at most 2 decimals');
