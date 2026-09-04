import { z } from 'zod';

import { requiredTrimmedText } from '../../common/text.js';

export type QuoteKind = z.infer<typeof QuoteKind>;
export const QuoteKind = z.enum(['product', 'custom']);

/**
 * Where a Product Quote's machine comes from: `stock` for one we already hold (an Allocation Quote,
 * which names a Product Unit), `order` for one still to be built. Derived from the Quote, never stored.
 */
export type QuoteProductSource = z.infer<typeof QuoteProductSource>;
export const QuoteProductSource = z.enum(['stock', 'order']);

export type QuoteWorkTitle = z.infer<typeof QuoteWorkTitle>;
export const QuoteWorkTitle = requiredTrimmedText('Work title is required');
