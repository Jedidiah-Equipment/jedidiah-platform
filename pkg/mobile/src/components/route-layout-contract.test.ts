import { readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { listTsxFiles } from './test-file-utils';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('route layout contract', () => {
  test('uses distinct Activity, Jobs, and Plan icons', () => {
    const tabBar = readFileSync(join(MOBILE_DIR, 'src/components/AppTabBar.tsx'), 'utf8');

    expect(tabBar).toContain('activity: IconActivity');
    expect(tabBar).toContain('jobs: IconBriefcase2');
    expect(tabBar).toContain('plan: IconCalendar');
    expect(tabBar).not.toContain('IconTimeline');
  });

  test('configures each explicit Stack initial route with its full registered child name', () => {
    const planDirectory = join(MOBILE_DIR, 'app/(protected)/(tabs)/(plan)');
    const layout = readFileSync(join(planDirectory, '_layout.tsx'), 'utf8');
    const initialRouteName = layout.match(/initialRouteName="([^"]+)"/)?.[1];
    const childNames = listTsxFiles(planDirectory)
      .filter((file) => !file.endsWith('_layout.tsx'))
      .map((file) => relative(planDirectory, file).slice(0, -extname(file).length));

    expect(initialRouteName).toBeDefined();
    expect(childNames).toContain(initialRouteName);
  });

  test('keeps access-query failures distinct from resolved permission denial', () => {
    const accessGates = [
      'app/(protected)/(tabs)/index.tsx',
      'app/(protected)/(tabs)/activity/_layout.tsx',
      'app/(protected)/(tabs)/jobs/_layout.tsx',
      'app/(protected)/(tabs)/(plan)/_layout.tsx',
    ];

    for (const file of accessGates) {
      const source = readFileSync(join(MOBILE_DIR, file), 'utf8');

      expect(source).toContain('access.isLoadingError');
      expect(source).toContain('<TabAccessErrorScreen');
      expect(source).toContain('access.refetch()');
    }
  });

  test('counts only the Bays visible after Plan search and uses Plan help on Bay schedules', () => {
    const plan = readFileSync(join(MOBILE_DIR, 'app/(protected)/(tabs)/(plan)/plan/index.tsx'), 'utf8');
    const baySchedule = readFileSync(join(MOBILE_DIR, 'src/components/bays/BayQueueScreen.tsx'), 'utf8');

    expect(plan).toContain("const total = state.status === 'ready' ? bays.length : null;");
    expect(baySchedule).toContain('helpTopic="plan"');
    expect(baySchedule).not.toContain('helpTopic="jobs"');
  });

  test('keeps flat and sectioned list toolbars at the same gap below the page header', () => {
    const catalogList = readFileSync(join(MOBILE_DIR, 'src/components/CatalogList.tsx'), 'utf8');
    const activity = readFileSync(join(MOBILE_DIR, 'app/(protected)/(tabs)/activity/index.tsx'), 'utf8');

    expect(catalogList).toContain('contentContainerClassName="w-full px-4 pb-8 pt-1"');
    expect(activity).toContain('contentContainerClassName="px-4 pb-8 pt-1"');
  });
});
