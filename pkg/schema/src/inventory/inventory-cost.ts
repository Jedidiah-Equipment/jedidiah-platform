import { z } from 'zod';
import { PriceDelta } from '../common/price.js';

/** Ledger unit costs retain sub-cent precision because linear valuation is expressed per millimetre. */
export type InventoryUnitCost = z.infer<typeof InventoryUnitCost>;
export const InventoryUnitCost = z.number().finite().min(0, 'Must be zero or greater');

/** Null means either no cost has been established yet or the caller cannot read inventory costs. */
export type InventoryCost = z.infer<typeof InventoryCost>;
export const InventoryCost = InventoryUnitCost.nullable();

/** A signed inventory valuation; null has the same no-cost-or-hidden meaning as InventoryCost. */
export type InventoryValue = z.infer<typeof InventoryValue>;
export const InventoryValue = PriceDelta.nullable();
