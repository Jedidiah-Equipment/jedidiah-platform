import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { Price } from '../common/price.js';
import { UUID } from '../common/uuid.js';

export type ProductOptionName = z.infer<typeof ProductOptionName>;
export const ProductOptionName = z.string().trim().min(1, 'Option name is required');

export type ProductOptionCode = z.infer<typeof ProductOptionCode>;
export const ProductOptionCode = z.string().trim().min(1, 'Option code is required');

export type ProductOptionPrice = z.infer<typeof ProductOptionPrice>;
export const ProductOptionPrice = z.coerce.number().pipe(Price);

export type ProductOption = z.infer<typeof ProductOption>;
export const ProductOption = z.object({
  id: UUID,
  productId: UUID,
  name: ProductOptionName,
  code: ProductOptionCode,
  price: ProductOptionPrice,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type ProductOptionCreateInput = z.infer<typeof ProductOptionCreateInput>;
export const ProductOptionCreateInput = z.object({
  name: ProductOptionName,
  code: ProductOptionCode,
  price: ProductOptionPrice,
});

export type ProductOptionUpsertInput = z.infer<typeof ProductOptionUpsertInput>;
export const ProductOptionUpsertInput = z.object({
  id: UUID.optional(),
  name: ProductOptionName,
  code: ProductOptionCode,
  price: ProductOptionPrice,
});
