import { z } from 'zod';

/** The two businesses the platform serves behind the symmetric wall (ADR 0016). */
export type Business = z.infer<typeof Business>;
export const Business = z.enum(['equipment', 'contracting']);

export const BUSINESSES = Business.options;

/** One value per business, built the same way for each. */
export function byBusiness<T>(build: (business: Business) => T): Record<Business, T> {
  return Object.fromEntries(BUSINESSES.map((business) => [business, build(business)])) as Record<Business, T>;
}
