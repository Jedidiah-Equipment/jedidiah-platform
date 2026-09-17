import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MOBILE_SCREEN_CATALOG, screenForSegments } from './screen-catalog';

const APP_ROOT = resolve(import.meta.dirname, '../../app');

function pageFiles(directory = APP_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    if (!entry.name.endsWith('.tsx') || entry.name === '_layout.tsx') return [];
    return [relative(APP_ROOT, path).replaceAll('\\', '/')];
  });
}

describe('mobile screen catalog', () => {
  it('covers every Expo Router page exactly once', () => {
    expect(Object.keys(MOBILE_SCREEN_CATALOG).sort()).toEqual(pageFiles().sort());
    expect(Object.keys(MOBILE_SCREEN_CATALOG)).toHaveLength(35);
  });

  it('resolves dynamic routes to patterns instead of concrete identifiers', () => {
    expect(
      screenForSegments(['(protected)', 'equipment', '(tabs)', 'stores', 'parts', '[partCode]', 'checkout']),
    ).toEqual({ business: 'equipment', name: '/equipment/stores/parts/[partCode]/checkout' });
    expect(screenForSegments(['(protected)', 'contracting', '(tabs)', 'jobs', '[jobId]'])).toEqual({
      business: 'contracting',
      name: '/contracting/jobs/[jobId]',
    });
  });
});
