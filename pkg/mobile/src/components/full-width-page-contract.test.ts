import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { listTsxFiles } from './test-file-utils';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('full-width page contract', () => {
  test('does not center route or scrolling content surfaces with automatic margins', () => {
    const appOffenders = listTsxFiles(join(MOBILE_DIR, 'app'))
      .filter((file) => readFileSync(file, 'utf8').includes('mx-auto'))
      .map((file) => relative(MOBILE_DIR, file));
    const scrollOffenders = listTsxFiles(join(MOBILE_DIR, 'src'))
      .filter((file) => /contentContainerClassName=["'][^"']*mx-auto/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(MOBILE_DIR, file));

    // Nested content may be deliberately sized; the page shell and its scroller may not be.
    expect({ appOffenders, scrollOffenders }).toEqual({ appOffenders: [], scrollOffenders: [] });
  });

  test('does not cap route or scrolling content widths', () => {
    const appFiles = listTsxFiles(join(MOBILE_DIR, 'app'));
    const sourceFiles = listTsxFiles(join(MOBILE_DIR, 'src'));
    const routeOffenders = appFiles
      .filter((file) => /max-w-|maxWidth/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(MOBILE_DIR, file));
    const scrollOffenders = sourceFiles
      .filter((file) => /contentContainerClassName=["'][^"']*max-w-/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(MOBILE_DIR, file));

    expect({ routeOffenders, scrollOffenders }).toEqual({ routeOffenders: [], scrollOffenders: [] });
  });
});
