import type { JobPickerOption } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { buildJobPickerModel } from './job-picker-model.js';

/** Branded ids and dates are the schema's business; a fixture only has to read like a Job. */
type JobFixture = { [Key in keyof JobPickerOption]?: string | null };

function job(overrides: JobFixture & { id: string }): JobPickerOption {
  return {
    code: 'JOB-00001',
    completedOn: null,
    createdAt: '2026-08-01T08:00:00.000Z',
    customerCompanyName: 'Ridgeway Haulage',
    productName: null,
    quoteKind: 'custom',
    updatedAt: '2026-08-01T08:00:00.000Z',
    workTitle: 'Trailer deck',
    ...overrides,
  } as JobPickerOption;
}

const model = (options: JobPickerOption[], overrides: Partial<Parameters<typeof buildJobPickerModel>[0]> = {}) =>
  buildJobPickerModel({ limit: 25, options, search: '', tab: 'updated', ...overrides });

describe('buildJobPickerModel', () => {
  it('orders the Last created tab by when each Job was raised, which the updated order can disagree with', () => {
    const older = job({ id: 'a', createdAt: '2026-08-02T08:00:00.000Z', updatedAt: '2026-08-02T08:00:00.000Z' });
    const newer = job({ id: 'b', createdAt: '2026-08-01T08:00:00.000Z', updatedAt: '2026-08-30T08:00:00.000Z' });

    expect(model([newer, older], { tab: 'created' }).rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(model([newer, older], { tab: 'updated' }).rows.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('drops a completed Job from the Non-complete tab while the recency tabs keep it', () => {
    const open = job({ id: 'a' });
    const complete = job({ completedOn: '2026-08-15', id: 'b' });

    expect(model([open, complete], { tab: 'incomplete' }).rows.map((row) => row.id)).toEqual(['a']);
    expect(model([open, complete], { tab: 'updated' }).rows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it.each([
    ['work title', 'trailer'],
    ['Customer name', 'ridgeway'],
  ])('finds a Job by its %s', (_field, search) => {
    const match = job({ code: 'JOB-00042', id: 'a' });
    const other = job({
      code: 'JOB-00099',
      customerCompanyName: 'Northlake Mining',
      id: 'b',
      workTitle: 'Hopper liner',
    });

    expect(model([match, other], { search }).rows.map((row) => row.id)).toEqual(['a']);
  });

  it('finds a Product build by its Product name', () => {
    const productJob = job({ id: 'a', productName: 'Side Tipper', quoteKind: 'product', workTitle: null });
    const other = job({ id: 'b' });

    expect(model([productJob, other], { search: 'tipper' }).rows.map((row) => row.id)).toEqual(['a']);
  });

  it('matches a shortened Job code that is not a substring of the padded one', () => {
    const match = job({ code: 'JOB-00042', id: 'a' });

    expect(model([match], { search: 'JOB-42' }).rows.map((row) => row.id)).toEqual(['a']);
  });

  it('searches across every tab rather than only the one in view', () => {
    const complete = job({ completedOn: '2026-08-15', id: 'a', workTitle: 'Trailer deck' });

    expect(model([complete], { search: 'trailer', tab: 'updated' }).rows).toHaveLength(1);
    expect(model([complete], { search: 'trailer', tab: 'incomplete' }).rows).toHaveLength(0);
  });

  it('reports the whole match count alongside the window it renders, so nothing is hidden silently', () => {
    const options = Array.from({ length: 7 }, (_unused, index) =>
      job({ id: `job-${index}`, updatedAt: `2026-08-0${index + 1}T08:00:00.000Z` }),
    );

    const windowed = model(options, { limit: 3 });

    expect(windowed.rows).toHaveLength(3);
    expect(windowed.total).toBe(7);
    expect(windowed.hasMore).toBe(true);
    expect(model(options, { limit: 25 }).hasMore).toBe(false);
  });
});
