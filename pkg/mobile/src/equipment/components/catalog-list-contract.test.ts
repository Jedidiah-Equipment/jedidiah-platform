import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG_SURFACES = [
  {
    component: 'src/equipment/components/jobs/JobCatalog.tsx',
    route: 'app/(protected)/equipment/(tabs)/jobs/index.tsx',
  },
  {
    component: 'src/equipment/components/bays/PlanCatalog.tsx',
    route: 'app/(protected)/equipment/(tabs)/(plan)/plan/index.tsx',
  },
  {
    component: 'src/equipment/components/products/ProductCatalog.tsx',
    route: 'app/(protected)/equipment/(tabs)/products/index.tsx',
  },
  {
    component: 'src/equipment/components/quotes/QuoteCatalog.tsx',
    route: 'app/(protected)/equipment/(tabs)/quotes/index.tsx',
  },
  {
    component: 'src/equipment/components/units/UnitCatalog.tsx',
    route: 'app/(protected)/equipment/(tabs)/units/index.tsx',
  },
] as const;

describe('catalog list contract', () => {
  test('uses the shared card and paginated list for every catalog root', () => {
    for (const surface of CATALOG_SURFACES) {
      const route = source(surface.route);
      const component = source(surface.component);

      expect(route).toContain("from '@/equipment/components/CatalogList'");
      expect(route).toContain('<PaginatedCatalogList');
      expect(component).toContain("from '@/equipment/components/CatalogList'");
      expect(component).toContain('<CatalogListCard');
      expect(`${route}\n${component}`).not.toContain('BoardGrid');
    }
  });
});

function source(relativePath: string): string {
  return readFileSync(join(MOBILE_DIR, relativePath), 'utf8');
}
