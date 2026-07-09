import { z } from 'zod';

export type Price = z.infer<typeof Price>;
export const Price = z.number().min(0, 'Must be zero or greater');

export type PriceDelta = z.infer<typeof PriceDelta>;
export const PriceDelta = z.number().finite('Price adjustment is required');

export type PriceDeltaInput = z.infer<typeof PriceDeltaInput>;
export const PriceDeltaInput = z.coerce.number().pipe(PriceDelta);
