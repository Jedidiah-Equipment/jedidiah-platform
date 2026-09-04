import { accessForRole } from '@pkg/domain/testing';
import { InventoryCost } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { mockSession } from '@/test/test-utils.js';

import type { Context } from '../../trpc/context.js';
import { createCallerFactory, protectedProcedure, router } from '../../trpc/init.js';
import { projectInventoryCostFields } from './inventory-cost-projection.js';

const InventoryValuation = z.object({
  quantity: z.number(),
  totalCost: InventoryCost,
  unitCost: InventoryCost,
});

const inventoryCostProjectionRouter = router({
  valuation: protectedProcedure.output(InventoryValuation).query(({ ctx }) =>
    projectInventoryCostFields({
      access: ctx.access,
      costFields: ['totalCost', 'unitCost'],
      output: {
        quantity: 2,
        totalCost: 50,
        unitCost: 25,
      },
    }),
  ),
});

const createCaller = createCallerFactory(inventoryCostProjectionRouter);

describe('inventory cost projection', () => {
  it('returns cost fields to a caller with inventory cost read access', async () => {
    await expect(callValuationAs('procurement-manager')).resolves.toEqual({
      quantity: 2,
      totalCost: 50,
      unitCost: 25,
    });
  });

  it('nulls cost fields for the same output when the caller cannot read inventory costs', async () => {
    await expect(callValuationAs('stores')).resolves.toEqual({
      quantity: 2,
      totalCost: null,
      unitCost: null,
    });
  });
});

function callValuationAs(role: 'procurement-manager' | 'stores') {
  const session = mockSession(role);

  return createCaller({
    access: accessForRole(role, session.user.id),
    session,
  } as Context).valuation();
}
