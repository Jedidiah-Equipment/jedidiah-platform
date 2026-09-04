import { z } from 'zod';
import { PriceDelta } from '../common/price.js';

/**
 * Every schema in this registry is a cost leaf: the server-side cost gate nulls it for callers
 * without `equipment_inventory_cost:read` (spec §11). A contract carrying one must reference the exported
 * leaf by value and declare the field through {@link declareInventoryCostFields}; the contract test
 * walks every exported schema and fails on a cost leaf no contract has declared.
 */
export const inventoryCostLeaves = z.registry<{ gated: true }>();

/** Ledger unit costs retain sub-cent precision because linear valuation is expressed per millimetre. */
export type InventoryUnitCost = z.infer<typeof InventoryUnitCost>;
export const InventoryUnitCost = z.number().finite().min(0, 'Must be zero or greater');

/** Null means either no cost has been established yet or the caller cannot read inventory costs. */
export type InventoryCost = z.infer<typeof InventoryCost>;
export const InventoryCost = InventoryUnitCost.nullable();
inventoryCostLeaves.add(InventoryCost, { gated: true });

/** A signed inventory valuation; null has the same no-cost-or-hidden meaning as InventoryCost. */
export type InventoryValue = z.infer<typeof InventoryValue>;
export const InventoryValue = PriceDelta.nullable();
inventoryCostLeaves.add(InventoryValue, { gated: true });

const declaredCostFields = new Map<z.ZodType, readonly PropertyKey[]>();

/**
 * Names the cost fields on one output contract, beside the schema that owns them: a renamed field
 * breaks the build, and a field added without being declared here fails the contract test. The
 * literal tuple it returns is what lets the API gate narrow the fields it nulls.
 */
export function declareInventoryCostFields<TOutput, const TFields extends readonly (keyof TOutput)[]>(
  schema: z.ZodType<TOutput>,
  ...fields: TFields
): TFields {
  declaredCostFields.set(schema, fields as readonly PropertyKey[]);

  return fields;
}

export function getDeclaredInventoryCostFields(schema: z.ZodType): readonly string[] | undefined {
  return declaredCostFields.get(schema) as readonly string[] | undefined;
}
