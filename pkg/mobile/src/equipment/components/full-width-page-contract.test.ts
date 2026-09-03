import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { listTsxFiles } from '@/components/test-file-utils';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('full-width page contract', () => {
  test('does not center route or scrolling content surfaces with automatic margins', () => {
    const offenders = mobileTsxFiles()
      .filter((file) => pageSurfaceTags(readFileSync(file, 'utf8')).some((tag) => classListHas(tag, /\bmx-auto\b/)))
      .map((file) => relative(MOBILE_DIR, file));

    expect(offenders).toEqual([]);
  });

  test('does not cap route or scrolling content widths', () => {
    const offenders = mobileTsxFiles()
      .filter((file) =>
        pageSurfaceTags(readFileSync(file, 'utf8')).some(
          (tag) => classListHas(tag, /\bmax-w-/) || /\bmaxWidth\s*:/.test(tag),
        ),
      )
      .map((file) => relative(MOBILE_DIR, file));

    expect(offenders).toEqual([]);
  });
});

function mobileTsxFiles(): string[] {
  return [...listTsxFiles(join(MOBILE_DIR, 'app')), ...listTsxFiles(join(MOBILE_DIR, 'src'))];
}

/** Nested overlays and fields may be sized; only page roots and scrolling surfaces are governed. */
function pageSurfaceTags(source: string): string[] {
  return [...source.matchAll(/<(?:SafeAreaView|ScrollView|FlatList|SectionList)\b[^>]*>/gs)].map(([tag]) => tag);
}

function classListHas(tag: string, pattern: RegExp): boolean {
  return [...tag.matchAll(/(?:className|contentContainerClassName)=["']([^"']*)["']/g)].some(([, className]) =>
    pattern.test(className ?? ''),
  );
}
