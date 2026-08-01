import type { z } from 'zod';
import { Price, PriceDelta } from '../common/price.js';

/** Null means either no cost has been established yet or the caller cannot read inventory costs. */
export type InventoryCost = z.infer<typeof InventoryCost>;
export const InventoryCost = Price.nullable();

/** A signed inventory valuation; null has the same no-cost-or-hidden meaning as InventoryCost. */
export type InventoryValue = z.infer<typeof InventoryValue>;
export const InventoryValue = PriceDelta.nullable();
