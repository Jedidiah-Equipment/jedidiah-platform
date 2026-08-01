import type { z } from 'zod';
import { Price } from '../common/price.js';

/** Null means either no cost has been established yet or the caller cannot read inventory costs. */
export type InventoryCost = z.infer<typeof InventoryCost>;
export const InventoryCost = Price.nullable();
