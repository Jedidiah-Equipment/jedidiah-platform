import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { listTsxFiles } from './test-file-utils';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROTECTED_ROUTES_DIR = join(MOBILE_DIR, 'app/(protected)');

const SIGNED_IN_PERMISSION_LOADING_SURFACES = {
  '(tabs)/(plan)/_layout.tsx': toolbar('main', 'src/components/TabAccessLoadingScreen.tsx'),
  '(tabs)/activity/_layout.tsx': toolbar('main', 'src/components/TabAccessLoadingScreen.tsx'),
  '(tabs)/jobs/_layout.tsx': toolbar('main', 'src/components/TabAccessLoadingScreen.tsx'),
  '(tabs)/products/_layout.tsx': toolbar('main', 'src/components/TabAccessLoadingScreen.tsx'),
  '(tabs)/quotes/_layout.tsx': toolbar('main', 'src/components/TabAccessLoadingScreen.tsx'),
  '(tabs)/stores/_layout.tsx': toolbar('main', 'src/components/TabAccessLoadingScreen.tsx'),
  '(tabs)/units/_layout.tsx': toolbar('main', 'src/components/TabAccessLoadingScreen.tsx'),
} as const;

const SIGNED_IN_ROUTE_TOOLBARS = {
  '(tabs)/(plan)/bays/[bayId].tsx': toolbar('secondary', 'src/components/bays/BayQueueScreen.tsx'),
  '(tabs)/(plan)/plan/index.tsx': toolbar('main', 'app/(protected)/(tabs)/(plan)/plan/index.tsx'),
  '(tabs)/activity/index.tsx': toolbar('main', 'app/(protected)/(tabs)/activity/index.tsx'),
  '(tabs)/index.tsx': toolbar('main', 'app/(protected)/(tabs)/index.tsx'),
  '(tabs)/jobs/[jobId].tsx': toolbar('secondary', 'src/components/bays/JobDetail.tsx'),
  '(tabs)/jobs/index.tsx': toolbar('main', 'app/(protected)/(tabs)/jobs/index.tsx'),
  '(tabs)/products/[productId].tsx': toolbar('secondary', 'app/(protected)/(tabs)/products/[productId].tsx'),
  '(tabs)/products/index.tsx': toolbar('main', 'app/(protected)/(tabs)/products/index.tsx'),
  '(tabs)/quotes/[quoteId].tsx': toolbar('secondary', 'src/components/quotes/QuoteDetailsScreen.tsx'),
  '(tabs)/quotes/index.tsx': toolbar('main', 'app/(protected)/(tabs)/quotes/index.tsx'),
  '(tabs)/stores/close-out/[jobId].tsx': toolbar('secondary', 'src/components/stores/StoresScreen.tsx'),
  '(tabs)/stores/close-out/index.tsx': toolbar('secondary', 'src/components/stores/StoresScreen.tsx'),
  '(tabs)/stores/stocktake/[sessionId].tsx': toolbar('secondary', 'src/components/stores/StoresScreen.tsx'),
  '(tabs)/stores/stocktake/index.tsx': toolbar('secondary', 'src/components/stores/StoresScreen.tsx'),
  '(tabs)/stores/index.tsx': toolbar('main', 'app/(protected)/(tabs)/stores/index.tsx'),
  '(tabs)/stores/parts/[partCode]/checkout.tsx': toolbar('secondary', 'src/components/stores/StoresScreen.tsx'),
  '(tabs)/stores/parts/[partCode]/index.tsx': toolbar('secondary', 'src/components/stores/StoresScreen.tsx'),
  '(tabs)/stores/parts/[partCode]/receive.tsx': toolbar('secondary', 'src/components/stores/StoresScreen.tsx'),
  '(tabs)/stores/parts/[partCode]/return-to-store.tsx': toolbar('secondary', 'src/components/stores/StoresScreen.tsx'),
  '(tabs)/stores/parts/[partCode]/return-to-supplier.tsx': toolbar(
    'secondary',
    'src/components/stores/StoresScreen.tsx',
  ),
  '(tabs)/units/[unitId].tsx': toolbar('secondary', 'app/(protected)/(tabs)/units/[unitId].tsx'),
  '(tabs)/units/index.tsx': toolbar('main', 'app/(protected)/(tabs)/units/index.tsx'),
  'assistant.tsx': toolbar('secondary', 'app/(protected)/assistant.tsx'),
  'documents/[documentId].tsx': toolbar('secondary', 'app/(protected)/documents/[documentId].tsx'),
} as const;

describe('signed-in toolbar contract', () => {
  test('classifies every protected page as main or secondary', () => {
    const routes = listTsxFiles(PROTECTED_ROUTES_DIR)
      .map((file) => relative(PROTECTED_ROUTES_DIR, file))
      .filter((file) => !file.endsWith('_layout.tsx'))
      .sort();

    expect(routes).toEqual(Object.keys(SIGNED_IN_ROUTE_TOOLBARS).sort());
    expectToolbarKinds(SIGNED_IN_ROUTE_TOOLBARS);
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
    expectToolbarKinds(SIGNED_IN_PERMISSION_LOADING_SURFACES);
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

type ToolbarKind = 'main' | 'secondary';
type ToolbarContract = { kind: ToolbarKind; owner: string };

function toolbar(kind: ToolbarKind, owner: string): ToolbarContract {
  return { kind, owner };
}

function expectToolbarKinds(contracts: Record<string, ToolbarContract>): void {
  for (const [route, contract] of Object.entries(contracts)) {
    const source = readFileSync(join(MOBILE_DIR, contract.owner), 'utf8');
    const expected = contract.kind === 'main' ? '<MainTabToolbar' : '<SecondaryPageToolbar';
    const unexpected = contract.kind === 'main' ? '<SecondaryPageToolbar' : '<MainTabToolbar';

    expect({ owner: contract.owner, route, usesExpectedToolbar: source.includes(expected) }).toEqual({
      owner: contract.owner,
      route,
      usesExpectedToolbar: true,
    });
    expect({ owner: contract.owner, route, usesWrongToolbar: source.includes(unexpected) }).toEqual({
      owner: contract.owner,
      route,
      usesWrongToolbar: false,
    });
  }
}
