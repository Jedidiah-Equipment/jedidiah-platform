import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createScreenResolver } from '@/lib/screen-catalog';
import { EQUIPMENT_SCREEN_CATALOG } from './screen-catalog';

const APP_ROOT = resolve(import.meta.dirname, '../../app');
const EQUIPMENT_APP_ROOT = join(APP_ROOT, '(protected)/equipment');

function pageFiles(directory = EQUIPMENT_APP_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    if (!entry.name.endsWith('.tsx') || entry.name === '_layout.tsx') return [];
    return [relative(APP_ROOT, path).replaceAll('\\', '/')];
  });
}

describe('Equipment screen catalog', () => {
  it('covers every Equipment Expo Router page exactly once', () => {
    expect(Object.keys(EQUIPMENT_SCREEN_CATALOG).sort()).toEqual(pageFiles().sort());
    expect(Object.keys(EQUIPMENT_SCREEN_CATALOG)).toHaveLength(24);
  });

  it('resolves a dynamic route to its pattern', () => {
    const resolveScreen = createScreenResolver([EQUIPMENT_SCREEN_CATALOG]);
    expect(resolveScreen(['(protected)', 'equipment', '(tabs)', 'stores', 'parts', '[partCode]', 'checkout'])).toEqual({
      business: 'equipment',
      name: '/equipment/stores/parts/[partCode]/checkout',
    });
  });
});
