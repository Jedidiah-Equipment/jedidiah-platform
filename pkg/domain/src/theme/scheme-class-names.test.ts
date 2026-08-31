import { describe, expect, it } from 'vitest';

import { productUnitBuildStateColorClassNames } from '../units/product-unit-build-state.js';
import { textClassNameForScheme } from './scheme-class-names.js';
import { statusBadgeColorClassNames } from './status-badge.js';

const paletteTextClassNames = [
  ...Object.values(statusBadgeColorClassNames).map((palette) => palette.text),
  ...Object.values(productUnitBuildStateColorClassNames).map((palette) => palette.text),
];

describe('textClassNameForScheme', () => {
  it('picks the half of the pair the scheme paints', () => {
    expect(textClassNameForScheme('text-emerald-800 dark:text-emerald-200', 'light')).toBe('text-emerald-800');
    expect(textClassNameForScheme('text-emerald-800 dark:text-emerald-200', 'dark')).toBe('text-emerald-200');
  });

  it('leaves a single-tone class alone in either scheme', () => {
    expect(textClassNameForScheme('text-foreground', 'light')).toBe('text-foreground');
    expect(textClassNameForScheme('text-foreground', 'dark')).toBe('text-foreground');
  });

  it('resolves every shared palette to a class carrying no unresolved dark variant', () => {
    for (const text of paletteTextClassNames) {
      expect(textClassNameForScheme(text, 'light')).not.toContain('dark:');
      expect(textClassNameForScheme(text, 'dark')).not.toContain('dark:');
      expect(textClassNameForScheme(text, 'light')).not.toBe(textClassNameForScheme(text, 'dark'));
    }
  });
});
