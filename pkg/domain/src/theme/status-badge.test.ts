import { describe, expect, it } from 'vitest';

import { statusBadgeColorClassNames } from './status-badge.js';

describe('shared badge palette', () => {
  /**
   * The bug behind #1373: native had been assembling the dark half by dropping `dark:` from the
   * two-tone class at runtime. Tailwind generates a rule per candidate it scans, so that produced a
   * class name with no rule behind it and the chip painted inherited foreground — dark on dark.
   * Both halves are literals here so both are generated; this is what keeps them saying one thing.
   */
  it('composes its authored halves back into the two-tone class web reads', () => {
    for (const palette of Object.values(statusBadgeColorClassNames)) {
      expect(`${palette.textByScheme.light} dark:${palette.textByScheme.dark}`).toBe(palette.text);
    }
  });
});
