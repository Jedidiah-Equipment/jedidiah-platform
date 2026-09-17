import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createScreenResolver, SHARED_SCREEN_CATALOG } from './screen-catalog';

const APP_ROOT = resolve(import.meta.dirname, '../../app');

function directPageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (!entry.name.endsWith('.tsx') || entry.name === '_layout.tsx') return [];
    return [relative(APP_ROOT, path).replaceAll('\\', '/')];
  });
}

describe('mobile screen catalog', () => {
  it('covers every shared Expo Router page exactly once', () => {
    const sharedPages = [...directPageFiles(APP_ROOT), ...directPageFiles(join(APP_ROOT, '(protected)'))];
    expect(Object.keys(SHARED_SCREEN_CATALOG).sort()).toEqual(sharedPages.sort());
    expect(Object.keys(SHARED_SCREEN_CATALOG)).toHaveLength(3);
  });

  it('resolves shared index routes', () => {
    const resolveScreen = createScreenResolver([SHARED_SCREEN_CATALOG]);
    expect(resolveScreen(['(protected)'])).toEqual({ business: null, name: '/' });
  });
});
