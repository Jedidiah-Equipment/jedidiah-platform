import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { listTsxFiles } from '@/components/test-file-utils';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');

// Exceptions: Activity's day-grouped timeline is shared with Job detail, and the Stores scan home is not a list.
const LIST_TAB_ROOTS = [
  'app/(protected)/equipment/(tabs)/(plan)/plan/index.tsx',
  'app/(protected)/equipment/(tabs)/jobs/index.tsx',
  'app/(protected)/equipment/(tabs)/products/index.tsx',
  'app/(protected)/equipment/(tabs)/quotes/index.tsx',
  'app/(protected)/equipment/(tabs)/units/index.tsx',
  'src/contracting/components/MachinesScreen.tsx',
  'src/contracting/field-notes/FieldNotesScreen.tsx',
  'src/contracting/jobs/JobsScreen.tsx',
  'src/contracting/workshop/WorkshopScreen.tsx',
] as const;

const REFRESH_CONTROL = 'src/components/ui/refresh-control.tsx';

describe('tab root list contract', () => {
  test('every list tab root renders the shared TabRootList', () => {
    for (const path of LIST_TAB_ROOTS) {
      const route = source(path);

      expect(route, path).toContain("from '@/components/TabRootList'");
      expect(route, path).toContain('<TabRootList');
    }
  });

  test('pull to refresh goes only through the shared control, which invalidates every API query', () => {
    const offenders = [...listTsxFiles(join(MOBILE_DIR, 'app')), ...listTsxFiles(join(MOBILE_DIR, 'src'))]
      .map((file) => relative(MOBILE_DIR, file))
      .filter((path) => path !== REFRESH_CONTROL && !path.endsWith('.test.tsx'))
      .filter((path) => {
        const code = source(path);
        return /\bonRefresh=|\brefreshing=|import \{[^}]*\bRefreshControl\b[^}]*\} from 'react-native'/.test(code);
      });

    expect(offenders).toEqual([]);
  });
});

function source(relativePath: string): string {
  return readFileSync(join(MOBILE_DIR, relativePath), 'utf8');
}
