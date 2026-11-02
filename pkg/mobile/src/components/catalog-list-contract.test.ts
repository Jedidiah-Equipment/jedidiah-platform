import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/** Every Contracting tab's stack is a copy of one folder. */
const CONTRACTING_TABS = 'app/(protected)/contracting/(tabs)/(activity,field-notes,jobs,machines,services,workshop)';

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
  {
    component: 'src/contracting/jobs/JobsScreen.tsx',
    route: `${CONTRACTING_TABS}/jobs/index.tsx`,
  },
  {
    component: 'src/contracting/components/MachinesScreen.tsx',
    route: `${CONTRACTING_TABS}/machines/index.tsx`,
  },
  {
    component: 'src/contracting/workshop/BreakdownRow.tsx',
    route: `${CONTRACTING_TABS}/workshop/index.tsx`,
  },
  {
    component: 'src/contracting/services/ServiceRow.tsx',
    route: `${CONTRACTING_TABS}/services/index.tsx`,
  },
  {
    component: 'src/contracting/services/DueMachineRow.tsx',
    route: `${CONTRACTING_TABS}/services/index.tsx`,
  },
  {
    component: 'src/contracting/field-notes/FieldNotesScreen.tsx',
    route: `${CONTRACTING_TABS}/field-notes/index.tsx`,
  },
] as const;

describe('catalog list contract', () => {
  test('uses the shared card for every catalog root', () => {
    for (const surface of CATALOG_SURFACES) {
      const route = source(surface.route);
      const component = source(surface.component);

      expect(component).toContain("from '@/components/CatalogList'");
      expect(component).toContain('<CatalogListCard');
      expect(`${route}\n${component}`).not.toContain('BoardGrid');
    }
  });
});

function source(relativePath: string): string {
  return readFileSync(join(MOBILE_DIR, relativePath), 'utf8');
}
