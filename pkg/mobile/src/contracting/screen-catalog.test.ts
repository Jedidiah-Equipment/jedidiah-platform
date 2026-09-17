import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createScreenResolver } from '@/lib/screen-catalog';
import { CONTRACTING_SCREEN_CATALOG } from './screen-catalog';

const APP_ROOT = resolve(import.meta.dirname, '../../app');
const CONTRACTING_APP_ROOT = join(APP_ROOT, '(protected)/contracting');

function pageFiles(directory = CONTRACTING_APP_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    if (!entry.name.endsWith('.tsx') || entry.name === '_layout.tsx') return [];
    return [relative(APP_ROOT, path).replaceAll('\\', '/')];
  });
}

describe('Contracting screen catalog', () => {
  it('covers every Contracting Expo Router page exactly once', () => {
    expect(Object.keys(CONTRACTING_SCREEN_CATALOG).sort()).toEqual(pageFiles().sort());
    expect(Object.keys(CONTRACTING_SCREEN_CATALOG)).toHaveLength(8);
  });

  it('resolves a dynamic route to its pattern', () => {
    const resolveScreen = createScreenResolver([CONTRACTING_SCREEN_CATALOG]);
    expect(resolveScreen(['(protected)', 'contracting', '(tabs)', 'jobs', '[jobId]'])).toEqual({
      business: 'contracting',
      name: '/contracting/jobs/[jobId]',
    });
  });
});
