import { readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { listTsxFiles } from './test-file-utils';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('route layout contract', () => {
  test('uses the web Jobs icon and a calendar icon for Plan', () => {
    const layout = readFileSync(join(MOBILE_DIR, 'app/(protected)/(tabs)/_layout.tsx'), 'utf8');

    expect(layout).toContain('<IconBriefcase2');
    expect(layout).toContain('<IconCalendar');
    expect(layout).not.toContain('<IconTimeline');
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
});
