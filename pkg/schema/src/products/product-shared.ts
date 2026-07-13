import { z } from 'zod';

// Job summaries reuse this field rule without importing product.ts, which depends on the Job-owned Bay schema.
export type ProductBuildTimeDays = z.infer<typeof ProductBuildTimeDays>;
export const ProductBuildTimeDays = z
  .number()
  .int('Build time must be a whole number')
  .min(0, 'Must be zero or greater');

export type ProductBuildTimeDaysInput = z.infer<typeof ProductBuildTimeDaysInput>;
export const ProductBuildTimeDaysInput = z.coerce.number().pipe(ProductBuildTimeDays);
