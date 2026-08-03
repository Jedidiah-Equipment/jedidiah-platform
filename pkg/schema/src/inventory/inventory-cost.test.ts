import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as contracts from '../index.js';
import {
  declareInventoryCostFields,
  getDeclaredInventoryCostFields,
  InventoryCost,
  InventoryValue,
  inventoryCostLeaves,
} from './inventory-cost.js';

/** Unwraps the modifiers a contract may wrap a leaf in before the registry check can see it. */
function unwrap(schema: z.ZodType): z.ZodType {
  const def = schema._zod.def as { innerType?: z.ZodType; type: string };

  return def.innerType && !inventoryCostLeaves.has(schema) ? unwrap(def.innerType) : schema;
}

function objectShape(schema: z.ZodType): Record<string, z.ZodType> | null {
  const inner = unwrap(schema);
  const def = inner._zod.def as { shape?: Record<string, z.ZodType>; type: string };

  return def.type === 'object' && def.shape ? def.shape : null;
}

/** Every object schema reachable from the package's exports, de-duplicated by identity. */
function collectObjectSchemas(): Set<z.ZodType> {
  const seen = new Set<z.ZodType>();
  const objects = new Set<z.ZodType>();

  const visit = (schema: unknown): void => {
    if (!(schema instanceof z.ZodType) || seen.has(schema)) return;
    seen.add(schema);

    const def = schema._zod.def as {
      element?: z.ZodType;
      innerType?: z.ZodType;
      options?: z.ZodType[];
      shape?: Record<string, z.ZodType>;
      valueType?: z.ZodType;
    };

    if (def.shape) {
      objects.add(schema);
      for (const field of Object.values(def.shape)) visit(field);
    }

    visit(def.element);
    visit(def.innerType);
    visit(def.valueType);
    for (const option of def.options ?? []) visit(option);
  };

  for (const exported of Object.values(contracts)) visit(exported);

  return objects;
}

describe('inventory cost contracts', () => {
  it('declares every cost field on every contract that carries one', () => {
    const undeclared: string[] = [];

    for (const schema of collectObjectSchemas()) {
      const shape = objectShape(schema);
      if (!shape) continue;

      const costFields = Object.entries(shape)
        .filter(([, field]) => inventoryCostLeaves.has(unwrap(field)))
        .map(([name]) => name)
        .sort();
      if (costFields.length === 0) continue;

      const declared = [...(getDeclaredInventoryCostFields(schema) ?? [])].sort();
      if (declared.join(',') !== costFields.join(',')) {
        undeclared.push(`{ ${costFields.join(', ')} } declared as { ${declared.join(', ')} }`);
      }
    }

    // A miss here means a contract gained a cost field that the API cost gate will never null.
    expect(undeclared).toEqual([]);
  });

  it('recognises both cost leaves through the modifiers contracts wrap them in', () => {
    expect(inventoryCostLeaves.has(InventoryCost)).toBe(true);
    expect(inventoryCostLeaves.has(InventoryValue)).toBe(true);
    expect(inventoryCostLeaves.has(unwrap(InventoryCost.optional()))).toBe(true);
    expect(inventoryCostLeaves.has(z.number().nullable())).toBe(false);
  });

  it('returns the declared fields so a contract can name them once', () => {
    const schema = z.object({ price: InventoryCost });

    expect(declareInventoryCostFields(schema, 'price')).toEqual(['price']);
    expect(getDeclaredInventoryCostFields(schema)).toEqual(['price']);
  });
});
