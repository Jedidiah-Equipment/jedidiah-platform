import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { listTsxFiles } from '@/components/test-file-utils';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROTECTED_ROUTES_DIR = join(MOBILE_DIR, 'app/(protected)');

const SIGNED_IN_PERMISSION_LOADING_SURFACES = {
  'equipment/(tabs)/(plan)/_layout.tsx': toolbar('main', 'src/equipment/components/TabAccessLoadingScreen.tsx'),
  'equipment/(tabs)/activity/_layout.tsx': toolbar('main', 'src/equipment/components/TabAccessLoadingScreen.tsx'),
  'equipment/(tabs)/jobs/_layout.tsx': toolbar('main', 'src/equipment/components/TabAccessLoadingScreen.tsx'),
  'equipment/(tabs)/products/_layout.tsx': toolbar('main', 'src/equipment/components/TabAccessLoadingScreen.tsx'),
  'equipment/(tabs)/quotes/_layout.tsx': toolbar('main', 'src/equipment/components/TabAccessLoadingScreen.tsx'),
  'equipment/(tabs)/stores/_layout.tsx': toolbar('main', 'src/equipment/components/TabAccessLoadingScreen.tsx'),
  'equipment/(tabs)/units/_layout.tsx': toolbar('main', 'src/equipment/components/TabAccessLoadingScreen.tsx'),
} as const;

const SIGNED_IN_ROUTE_TOOLBARS = {
  'contracting/index.tsx': toolbar('main', 'app/(protected)/contracting/index.tsx', 'MainToolbar'),
  'equipment/(tabs)/(plan)/bays/[bayId].tsx': toolbar('secondary', 'src/equipment/components/bays/BayQueueScreen.tsx'),
  'equipment/(tabs)/(plan)/plan/index.tsx': toolbar('main', 'app/(protected)/equipment/(tabs)/(plan)/plan/index.tsx'),
  'equipment/(tabs)/activity/index.tsx': toolbar('main', 'app/(protected)/equipment/(tabs)/activity/index.tsx'),
  'equipment/(tabs)/index.tsx': toolbar('main', 'app/(protected)/equipment/(tabs)/index.tsx'),
  'equipment/(tabs)/jobs/[jobId].tsx': toolbar('secondary', 'src/equipment/components/bays/JobDetail.tsx'),
  'equipment/(tabs)/jobs/index.tsx': toolbar('main', 'app/(protected)/equipment/(tabs)/jobs/index.tsx'),
  'equipment/(tabs)/products/[productId].tsx': toolbar(
    'secondary',
    'app/(protected)/equipment/(tabs)/products/[productId].tsx',
  ),
  'equipment/(tabs)/products/index.tsx': toolbar('main', 'app/(protected)/equipment/(tabs)/products/index.tsx'),
  'equipment/(tabs)/quotes/[quoteId].tsx': toolbar(
    'secondary',
    'src/equipment/components/quotes/QuoteDetailsScreen.tsx',
  ),
  'equipment/(tabs)/quotes/index.tsx': toolbar('main', 'app/(protected)/equipment/(tabs)/quotes/index.tsx'),
  'equipment/(tabs)/stores/close-out/[jobId].tsx': toolbar(
    'secondary',
    'src/equipment/components/stores/StoresScreen.tsx',
  ),
  'equipment/(tabs)/stores/close-out/index.tsx': toolbar(
    'secondary',
    'src/equipment/components/stores/StoresScreen.tsx',
  ),
  'equipment/(tabs)/stores/stocktake/[sessionId].tsx': toolbar(
    'secondary',
    'src/equipment/components/stores/StoresScreen.tsx',
  ),
  'equipment/(tabs)/stores/stocktake/index.tsx': toolbar(
    'secondary',
    'src/equipment/components/stores/StoresScreen.tsx',
  ),
  'equipment/(tabs)/stores/index.tsx': toolbar('main', 'app/(protected)/equipment/(tabs)/stores/index.tsx'),
  'equipment/(tabs)/stores/parts/[partCode]/checkout.tsx': toolbar(
    'secondary',
    'src/equipment/components/stores/StoresScreen.tsx',
  ),
  'equipment/(tabs)/stores/parts/[partCode]/index.tsx': toolbar(
    'secondary',
    'src/equipment/components/stores/StoresScreen.tsx',
  ),
  'equipment/(tabs)/stores/parts/[partCode]/receive.tsx': toolbar(
    'secondary',
    'src/equipment/components/stores/StoresScreen.tsx',
  ),
  'equipment/(tabs)/stores/parts/[partCode]/return-to-store.tsx': toolbar(
    'secondary',
    'src/equipment/components/stores/StoresScreen.tsx',
  ),
  'equipment/(tabs)/stores/parts/[partCode]/return-to-supplier.tsx': toolbar(
    'secondary',
    'src/equipment/components/stores/StoresScreen.tsx',
  ),
  'equipment/(tabs)/units/[unitId].tsx': toolbar('secondary', 'app/(protected)/equipment/(tabs)/units/[unitId].tsx'),
  'equipment/(tabs)/units/index.tsx': toolbar('main', 'app/(protected)/equipment/(tabs)/units/index.tsx'),
  'equipment/assistant.tsx': toolbar('secondary', 'app/(protected)/equipment/assistant.tsx'),
  'equipment/documents/[documentId].tsx': toolbar('secondary', 'app/(protected)/equipment/documents/[documentId].tsx'),
} as const;

const REDIRECT_ONLY_ROUTES = new Set(['index.tsx']);

describe('signed-in toolbar contract', () => {
  test('classifies every protected page as main or secondary', () => {
    const routes = listTsxFiles(PROTECTED_ROUTES_DIR)
      .map((file) => relative(PROTECTED_ROUTES_DIR, file))
      .filter((file) => !file.endsWith('_layout.tsx'))
      .filter((file) => !REDIRECT_ONLY_ROUTES.has(file))
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
    const toolbarFiles = new Set([
      join(MOBILE_DIR, 'src/components/TopToolbar.tsx'),
      join(MOBILE_DIR, 'src/equipment/components/TopToolbar.tsx'),
    ]);
    const offenders = files
      .filter((file) => !toolbarFiles.has(file))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return /from ['"]@\/(?:components\/ProfileMenuButton|equipment\/components\/assistant\/AssistantEntryButton)['"]/.test(
          source,
        );
      })
      .map((file) => relative(MOBILE_DIR, file));

    expect(offenders).toEqual([]);
  });
});

type ToolbarKind = 'main' | 'secondary';
type ToolbarComponent = 'MainTabToolbar' | 'MainToolbar' | 'SecondaryPageToolbar';
type ToolbarContract = { component: ToolbarComponent; kind: ToolbarKind; owner: string };

// Equipment pages go through their business wrapper; Contracting has no business-specific actions yet, so
// its pages render the shared frame directly.
function toolbar(
  kind: ToolbarKind,
  owner: string,
  component: ToolbarComponent = kind === 'main' ? 'MainTabToolbar' : 'SecondaryPageToolbar',
): ToolbarContract {
  return { component, kind, owner };
}

function expectToolbarKinds(contracts: Record<string, ToolbarContract>): void {
  for (const [route, contract] of Object.entries(contracts)) {
    const source = readFileSync(join(MOBILE_DIR, contract.owner), 'utf8');
    const expected = `<${contract.component}`;
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
