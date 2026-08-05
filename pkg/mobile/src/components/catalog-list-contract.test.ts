import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG_SURFACES = [
  {
    component: 'src/components/jobs/JobCatalog.tsx',
    route: 'app/(protected)/(tabs)/jobs/index.tsx',
  },
  {
    component: 'src/components/bays/PlanCatalog.tsx',
    route: 'app/(protected)/(tabs)/(plan)/plan/index.tsx',
  },
  {
    component: 'src/components/products/ProductCatalog.tsx',
    route: 'app/(protected)/(tabs)/products/index.tsx',
  },
  {
    component: 'src/components/quotes/QuoteCatalog.tsx',
    route: 'app/(protected)/(tabs)/quotes/index.tsx',
  },
  {
    component: 'src/components/units/UnitCatalog.tsx',
    route: 'app/(protected)/(tabs)/units/index.tsx',
  },
] as const;

describe('catalog list contract', () => {
  test('uses the shared card and paginated list for every catalog root', () => {
    for (const surface of CATALOG_SURFACES) {
      const route = source(surface.route);
      const component = source(surface.component);

      expect(route).toContain("from '@/components/CatalogList'");
      expect(route).toContain('<PaginatedCatalogList');
      expect(component).toContain("from '@/components/CatalogList'");
      expect(component).toContain('<CatalogListCard');
      expect(`${route}\n${component}`).not.toContain('BoardGrid');
    }
  });
});

function source(relativePath: string): string {
  return readFileSync(join(MOBILE_DIR, relativePath), 'utf8');
}
