import { z } from 'zod';

import { requiredTrimmedText } from '../../common/text.js';

export type QuoteKind = z.infer<typeof QuoteKind>;
export const QuoteKind = z.enum(['product', 'custom']);

/** What a Quote is selling, as people name it. A Parts Sale is a Custom Quote that never sources a Job. */
export type QuoteOfferingType = z.infer<typeof QuoteOfferingType>;
export const QuoteOfferingType = z.enum(['product', 'custom', 'parts-sale']);

/**
 * Where a Product Quote's machine comes from: `stock` for one we already hold (an Allocation Quote,
 * which names a Product Unit), `order` for one still to be built. Derived from the Quote, never stored.
 */
export type QuoteProductSource = z.infer<typeof QuoteProductSource>;
export const QuoteProductSource = z.enum(['stock', 'order']);

export type QuoteWorkTitle = z.infer<typeof QuoteWorkTitle>;
export const QuoteWorkTitle = requiredTrimmedText('Work title is required');
