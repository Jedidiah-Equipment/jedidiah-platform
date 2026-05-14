import { z } from 'zod';

export type SortDirection = z.infer<typeof SortDirection>;
export const SortDirection = z.enum(['asc', 'desc']);
