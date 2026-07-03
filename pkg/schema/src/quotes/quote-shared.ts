import { z } from 'zod';

import { requiredTrimmedText } from '../common/text.js';

export type QuoteKind = z.infer<typeof QuoteKind>;
export const QuoteKind = z.enum(['product', 'custom']);

export type QuoteWorkTitle = z.infer<typeof QuoteWorkTitle>;
export const QuoteWorkTitle = requiredTrimmedText('Work title is required');
