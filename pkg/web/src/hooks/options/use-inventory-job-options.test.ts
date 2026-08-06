import type { InventoryJobOption } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { withSelectedJobPinnedFirst } from './use-inventory-job-options.js';

const job = (code: string): InventoryJobOption => ({
  code,
  completedOn: null,
  displayName: `Job ${code}`,
  id: `id-${code}`,
});

describe('withSelectedJobPinnedFirst', () => {
  it('leaves the page alone when nothing is selected', () => {
    expect(withSelectedJobPinnedFirst([job('JOB-00001')], null).map((option) => option.code)).toEqual(['JOB-00001']);
  });

  it('does not repeat a selected Job the page already holds', () => {
    const page = [job('JOB-00001'), job('JOB-00002')];

    expect(withSelectedJobPinnedFirst(page, job('JOB-00002')).map((option) => option.code)).toEqual([
      'JOB-00001',
      'JOB-00002',
    ]);
  });

  it('holds an off-page selection at the head, where loading a page cannot move it', () => {
    const selected = job('JOB-00300');
    const firstPage = withSelectedJobPinnedFirst([job('JOB-00001')], selected);
    const bothPages = withSelectedJobPinnedFirst([job('JOB-00001'), job('JOB-00002')], selected);

    expect(firstPage[0]?.code).toBe('JOB-00300');
    expect(bothPages[0]?.code).toBe('JOB-00300');
    expect(bothPages.map((option) => option.code)).toEqual(['JOB-00300', 'JOB-00001', 'JOB-00002']);
  });
});
