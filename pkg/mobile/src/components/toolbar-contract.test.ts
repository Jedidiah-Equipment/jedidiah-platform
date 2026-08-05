import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { listTsxFiles } from './test-file-utils';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROTECTED_ROUTES_DIR = join(MOBILE_DIR, 'app/(protected)');

const SIGNED_IN_PERMISSION_LOADING_SURFACES = {
  '(tabs)/products/_layout.tsx': 'main',
  '(tabs)/quotes/_layout.tsx': 'main',
  '(tabs)/stores/_layout.tsx': 'main',
  '(tabs)/units/_layout.tsx': 'main',
} as const;

const SIGNED_IN_ROUTE_TOOLBARS = {
  '(tabs)/(schedule)/bays/[bayId].tsx': 'secondary',
  '(tabs)/(schedule)/index.tsx': 'main',
  '(tabs)/(schedule)/jobs/[jobId].tsx': 'secondary',
  '(tabs)/products/[productId].tsx': 'secondary',
  '(tabs)/products/index.tsx': 'main',
  '(tabs)/quotes/[quoteId].tsx': 'secondary',
  '(tabs)/quotes/index.tsx': 'main',
  '(tabs)/stores/close-out/[jobId].tsx': 'secondary',
  '(tabs)/stores/close-out/index.tsx': 'secondary',
  '(tabs)/stores/index.tsx': 'main',
  '(tabs)/stores/parts/[partCode]/checkout.tsx': 'secondary',
  '(tabs)/stores/parts/[partCode]/index.tsx': 'secondary',
  '(tabs)/stores/parts/[partCode]/receive.tsx': 'secondary',
  '(tabs)/stores/parts/[partCode]/return-to-store.tsx': 'secondary',
  '(tabs)/stores/parts/[partCode]/return-to-supplier.tsx': 'secondary',
  '(tabs)/units/[unitId].tsx': 'secondary',
  '(tabs)/units/index.tsx': 'main',
  'assistant.tsx': 'secondary',
  'documents/[documentId].tsx': 'secondary',
} as const;

describe('signed-in toolbar contract', () => {
  test('classifies every protected page as main or secondary', () => {
    const routes = listTsxFiles(PROTECTED_ROUTES_DIR)
      .map((file) => relative(PROTECTED_ROUTES_DIR, file))
      .filter((file) => !file.endsWith('_layout.tsx'))
      .sort();

    expect(routes).toEqual(Object.keys(SIGNED_IN_ROUTE_TOOLBARS).sort());
  });

  test('renders permission-loading surfaces inside the main tab toolbar contract', () => {
    const permissionLayouts = listTsxFiles(PROTECTED_ROUTES_DIR)
      .map((file) => ({ file, route: relative(PROTECTED_ROUTES_DIR, file) }))
      .filter(
        ({ file, route }) => route.endsWith('_layout.tsx') && readFileSync(file, 'utf8').includes('access.isPending'),
      )
      .sort((left, right) => left.route.localeCompare(right.route));

    expect(permissionLayouts.map(({ route }) => route).sort()).toEqual(
      Object.keys(SIGNED_IN_PERMISSION_LOADING_SURFACES).sort(),
    );
    expect(
      permissionLayouts.map(({ file, route }) => ({
        route,
        usesStandardLoadingSurface: readFileSync(file, 'utf8').includes('<TabAccessLoadingScreen'),
      })),
    ).toEqual(
      Object.keys(SIGNED_IN_PERMISSION_LOADING_SURFACES).map((route) => ({
        route,
        usesStandardLoadingSurface: true,
      })),
    );
  });

  test('assembles signed-in toolbar chrome only in TopToolbar', () => {
    const files = [...listTsxFiles(join(MOBILE_DIR, 'app')), ...listTsxFiles(join(MOBILE_DIR, 'src'))];
    const offenders = files
      .filter((file) => file !== join(MOBILE_DIR, 'src/components/TopToolbar.tsx'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return /from ['"]@\/components\/(?:ProfileMenuButton|assistant\/AssistantEntryButton)['"]/.test(source);
      })
      .map((file) => relative(MOBILE_DIR, file));

    expect(offenders).toEqual([]);
  });
});
