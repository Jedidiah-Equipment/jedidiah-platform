import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { listSourceFiles } from '../components/test-file-utils';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Where the raw brand yellow is declared, before anything decides which scheme paints it. */
const BRAND_PALETTE_MODULES = ['src/theme/brand-colors.ts', 'src/theme/brand-palette.ts'];

/**
 * The splash screens that carry their own hard-coded dark backdrop. They paint before a colour-mode
 * preference is known, so the brightest yellow is safe there and nowhere else: on a themed surface
 * it is unreadable in light mode, which is what {@link useBrandForegroundColor} exists to prevent.
 */
const HARD_CODED_DARK_SPLASH_SCREENS = [
  'app/(protected)/_layout.tsx',
  'app/_layout.tsx',
  'src/theme/ColorModeProvider.tsx',
  'src/theme/use-brand-foreground.ts',
];

describe('light-mode yellow contract', () => {
  test('keeps the brightest brand yellow off themed surfaces', () => {
    const allowed = new Set([...BRAND_PALETTE_MODULES, ...HARD_CODED_DARK_SPLASH_SCREENS]);
    const offenders = mobileSourceFiles()
      .filter((file) => /#fff000|\bloadingSpinnerColor\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(MOBILE_DIR, file))
      .filter((file) => !allowed.has(file));

    expect(offenders).toEqual([]);
  });
});

function mobileSourceFiles(): string[] {
  return [...listSourceFiles(join(MOBILE_DIR, 'app')), ...listSourceFiles(join(MOBILE_DIR, 'src'))].filter(
    (file) => !/\.test\.tsx?$/.test(file),
  );
}
