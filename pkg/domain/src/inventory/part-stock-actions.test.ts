import { describe, expect, test } from 'vitest';
import type { PartStockActionFacts } from './part-stock-actions.js';
import { derivePartStockActions } from './part-stock-actions.js';

const BOUGHT: PartStockActionFacts = {
  isInternallyFabricated: false,
  stockTrackingMode: 'perpetual',
  unitOfMeasure: 'piece',
};

const BUILT: PartStockActionFacts = { ...BOUGHT, isInternallyFabricated: true };
const PERIODIC: PartStockActionFacts = { ...BOUGHT, stockTrackingMode: 'periodic' };
const LINEAR: PartStockActionFacts = { ...BOUGHT, unitOfMeasure: 'mm' };

describe('derivePartStockActions', () => {
  test('an ordinary bought, perpetual Part may be asked to do everything but build', () => {
    const actions = derivePartStockActions(BOUGHT);

    expect(actions).toEqual({
      adjust: { allowed: true },
      build: { allowed: false, reason: 'not-built' },
      checkout: { allowed: true },
      count: { allowed: true },
      purchase: { allowed: true },
      receive: { allowed: true },
      returnToStore: { allowed: true },
      returnToSupplier: { allowed: true },
      revalue: { allowed: true },
    });
  });

  test('a Built Part is produced into and never bought, costed, or sent back', () => {
    const actions = derivePartStockActions(BUILT);

    expect(actions.build).toEqual({ allowed: true });
    expect(actions.purchase).toEqual({ allowed: false, reason: 'built-part' });
    expect(actions.receive).toEqual({ allowed: false, reason: 'built-part' });
    expect(actions.returnToSupplier).toEqual({ allowed: false, reason: 'built-part' });
    expect(actions.revalue).toEqual({ allowed: false, reason: 'cost-derived' });
  });

  test('a Built Part still moves against a Job and is counted like any other', () => {
    const actions = derivePartStockActions(BUILT);

    expect(actions.checkout).toEqual({ allowed: true });
    expect(actions.returnToStore).toEqual({ allowed: true });
    expect(actions.count).toEqual({ allowed: true });
    expect(actions.adjust).toEqual({ allowed: true });
  });

  test('a periodic Part rejects consumption, because only a count corrects it between counts', () => {
    const actions = derivePartStockActions(PERIODIC);

    expect(actions.checkout).toEqual({ allowed: false, reason: 'periodic' });
    expect(actions.returnToStore).toEqual({ allowed: false, reason: 'periodic' });
    expect(actions.build).toEqual({ allowed: false, reason: 'not-built' });
  });

  test('a periodic Part still receives, counts, and revalues', () => {
    const actions = derivePartStockActions(PERIODIC);

    // Bought-in raw material arrives on a Purchase Order, and the receipt is the baseline the next
    // count corrects. Revaluation is how a supplier invoice answers a price its receipts got wrong.
    expect(actions.receive).toEqual({ allowed: true });
    expect(actions.purchase).toEqual({ allowed: true });
    expect(actions.returnToSupplier).toEqual({ allowed: true });
    expect(actions.count).toEqual({ allowed: true });
    expect(actions.revalue).toEqual({ allowed: true });
  });

  test('a linear Part is never built, because a build posts one row and not a length bucket', () => {
    expect(derivePartStockActions({ ...LINEAR, isInternallyFabricated: true }).build).toEqual({
      allowed: false,
      reason: 'linear',
    });
  });

  test('a linear bought Part reads as not built rather than as linear', () => {
    // Fabrication is the first question a build asks; a bought Part is refused for being bought
    // whatever its unit of measure, so the surface says the one thing that could change.
    expect(derivePartStockActions(LINEAR).build).toEqual({ allowed: false, reason: 'not-built' });
  });

  test('a periodic Built Part reports the fabrication rule it could satisfy last', () => {
    const actions = derivePartStockActions({ ...BUILT, stockTrackingMode: 'periodic' });

    expect(actions.build).toEqual({ allowed: false, reason: 'periodic' });
  });

  test('linear stock moves against a Job and returns to the Supplier like any other', () => {
    const actions = derivePartStockActions(LINEAR);

    expect(actions.checkout).toEqual({ allowed: true });
    expect(actions.returnToStore).toEqual({ allowed: true });
    expect(actions.returnToSupplier).toEqual({ allowed: true });
    expect(actions.revalue).toEqual({ allowed: true });
  });
});
