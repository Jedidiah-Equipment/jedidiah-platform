import { z } from 'zod';

/** The two businesses the platform serves behind the symmetric wall (ADR 0016). */
export type Business = z.infer<typeof Business>;
export const Business = z.enum(['equipment', 'contracting']);

export const BUSINESSES = Business.options;
