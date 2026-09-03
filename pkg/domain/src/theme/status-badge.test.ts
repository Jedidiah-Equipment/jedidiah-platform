import { describe, expect, it } from 'vitest';

import { productUnitBuildStateColorClassNames } from '../equipment/units/product-unit-build-state.js';
import { statusBadgeColorClassNames } from './status-badge.js';

/**
 * Every palette that authors its own colour literals. The Quote, Feedback, stocktake and Purchase
 * Order records alias these entries rather than naming a colour of their own, so covering the two
 * sources covers all of them.
 */
const badgePalettes = [
  ...Object.values(statusBadgeColorClassNames),
  ...Object.values(productUnitBuildStateColorClassNames),
];

describe('badge palettes', () => {
  /**
   * The bug behind #1373: native had been assembling the dark half by dropping `dark:` from the
   * two-tone class at runtime. Tailwind generates a rule per candidate it scans, so that produced a
   * class name with no rule behind it and the chip painted inherited foreground — dark on dark.
   * Both halves are literals here so both are generated; this is what keeps them saying one thing.
   */
  it('composes its authored halves back into the two-tone class web reads', () => {
    for (const palette of badgePalettes) {
      expect(`${palette.textByScheme.light} dark:${palette.textByScheme.dark}`).toBe(palette.text);
    }
  });
});
