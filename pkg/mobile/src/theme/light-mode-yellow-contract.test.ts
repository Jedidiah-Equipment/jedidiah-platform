import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { listTsxFiles } from '../components/test-file-utils';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The brightest brand yellow is unreadable on a light surface, so only the pre-theme splash screens
 * — which paint their own hard-coded dark backdrop before a preference is known — may reach for it.
 * Every themed surface takes the scheme-aware brand foreground instead.
 */
const HARD_CODED_DARK_SPLASH_SCREENS = [
  'app/(protected)/_layout.tsx',
  'app/_layout.tsx',
  'src/theme/ColorModeProvider.tsx',
];

describe('light-mode yellow contract', () => {
  test('keeps the brightest brand yellow off themed surfaces', () => {
    const offenders = mobileTsxFiles()
      .filter((file) => /#fff000|\bloadingSpinnerColor\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(MOBILE_DIR, file))
      .filter((file) => !HARD_CODED_DARK_SPLASH_SCREENS.includes(file));

    expect(offenders).toEqual([]);
  });
});

function mobileTsxFiles(): string[] {
  return [...listTsxFiles(join(MOBILE_DIR, 'app')), ...listTsxFiles(join(MOBILE_DIR, 'src'))].filter(
    (file) => !file.endsWith('.test.tsx'),
  );
}
