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

const quoteInventoryPartShape = {
  averageUtilizationPercent: PartAverageUtilizationPercent.nullable(),
  code: PartCode,
  /** Free Stock: on hand minus open Job commitments. Shown, never enforced. */
  freeQuantity: z.number().finite(),
  id: UUID,
  name: PartName,
  partCategoryName: PartCategoryName,
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable(),
  unitOfMeasure: PartUnitOfMeasure,
};

/**
 * A catalog Part as the Work Item's "Add inventory part" dialog offers it: a sell price, never a
 * cost. `sellPricePerBasisUnit` is the moving average marked up by the Part Category, per costing
 * basis unit: per millimetre for a linear Part, per whole unit otherwise. It must reach `sales`,
 * who are cost-blind, so it is deliberately NOT an inventory cost field. Where no price can be
 * offered, `priceNote` says why and the price is null, never zero.
 */
export type QuoteInventoryPartOption = z.infer<typeof QuoteInventoryPartOption>;
export const QuoteInventoryPartOption = z.discriminatedUnion('priceNote', [
  z.object({ ...quoteInventoryPartShape, priceNote: z.null(), sellPricePerBasisUnit: Price }),
  z.object({ ...quoteInventoryPartShape, priceNote: QuoteInventoryPartPriceNote, sellPricePerBasisUnit: z.null() }),
]);

/**
 * Not `.strict()`: tRPC's infinite query appends its own `direction` key to the page params. No
 * `limit: 0`: every row replays its Part's whole ledger, so the read is only ever one narrow page.
 */
export type QuoteInventoryPartListInput = z.infer<typeof QuoteInventoryPartListInput>;
export const QuoteInventoryPartListInput = CursorQueryInput.extend({
  limit: CursorQueryInput.shape.limit.pipe(z.int().min(1)),
  search: SearchText,
});

export type QuoteInventoryPartListResult = z.infer<typeof QuoteInventoryPartListResult>;
export const QuoteInventoryPartListResult = createCursorQueryResult(QuoteInventoryPartOption);

/** How long a piece of a linear Part is being sold, in whole millimetres. */
export type QuoteInventoryPartLengthMm = z.infer<typeof QuoteInventoryPartLengthMm>;
export const QuoteInventoryPartLengthMm = z.int('Must be a whole number').positive('Must be 1 or greater');

/** Part area ÷ plate area, no waste. */
export type QuoteInventoryPartPlatePercent = z.infer<typeof QuoteInventoryPartPlatePercent>;
export const QuoteInventoryPartPlatePercent = z
  .number()
  .positive('Must be greater than 0')
  .max(100, 'Must be 100 or less')
  .multipleOf(0.01, 'Use at most 2 decimals');
