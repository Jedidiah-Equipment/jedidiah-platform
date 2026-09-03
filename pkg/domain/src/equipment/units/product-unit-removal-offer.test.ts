import { describe, expect, it } from 'vitest';

import { resolveUnitRemovalOffer } from './product-unit-removal-offer.js';

describe('resolveUnitRemovalOffer', () => {
  it('offers removal already ticked when the shop never touched the build', () => {
    expect(resolveUnitRemovalOffer({ completedOn: null, hasDrawnStock: false, hasStartedSlot: false })).toEqual({
      offered: true,
      removeByDefault: true,
    });
  });

  it('still offers removal but leaves it unticked once a slot has started', () => {
    expect(resolveUnitRemovalOffer({ completedOn: null, hasDrawnStock: false, hasStartedSlot: true })).toEqual({
      offered: true,
      removeByDefault: false,
    });
  });

  it('still offers removal but leaves it unticked once stock has been drawn', () => {
    expect(resolveUnitRemovalOffer({ completedOn: null, hasDrawnStock: true, hasStartedSlot: false })).toEqual({
      offered: true,
      removeByDefault: false,
    });
  });

  it('does not offer removal at all once the build completed', () => {
    expect(resolveUnitRemovalOffer({ completedOn: '2026-08-01', hasDrawnStock: false, hasStartedSlot: false })).toEqual(
      { offered: false },
    );
  });
});
