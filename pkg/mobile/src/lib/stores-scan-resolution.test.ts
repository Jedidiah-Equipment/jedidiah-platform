import { badgeScanToken } from '@pkg/domain';
import { describe, expect, it, vi } from 'vitest';

import { resolveScan } from './stores-scan-resolution';

const STORES_PERSON = { id: 'stores-person', name: 'Thabo Mokoena', thumbnailDataUrl: null };

function harness({
  actors = [STORES_PERSON],
  actorsFail = false,
  partCodes = ['BRG-100'],
}: {
  actors?: (typeof STORES_PERSON)[];
  actorsFail?: boolean;
  partCodes?: string[];
} = {}) {
  const fetchActors = vi.fn(async () => {
    if (actorsFail) throw new Error('offline');
    return { items: actors };
  });
  const fetchPartByCode = vi.fn(async (code: string) => {
    if (!partCodes.includes(code)) throw new Error('not found');
    return { partCode: code };
  });

  return { fetchActors, fetchPartByCode };
}

describe('resolveScan', () => {
  it('selects the person a badge card names', async () => {
    const { fetchActors, fetchPartByCode } = harness();

    await expect(resolveScan({ fetchActors, fetchPartByCode, raw: badgeScanToken('stores-person') })).resolves.toEqual({
      actor: STORES_PERSON,
      kind: 'actor',
    });
    // A badge is never tried as a Part code, so a lookup for `badge:...` cannot reach the catalog.
    expect(fetchPartByCode).not.toHaveBeenCalled();
  });

  it('takes anything else to the Part its code names', async () => {
    const { fetchActors, fetchPartByCode } = harness();

    await expect(resolveScan({ fetchActors, fetchPartByCode, raw: 'BRG-100' })).resolves.toEqual({
      kind: 'part',
      partCode: 'BRG-100',
    });
    expect(fetchActors).not.toHaveBeenCalled();
  });

  /** A badge for someone who has left must fail at the scan, not silently at the first post. */
  it('refuses a badge that names nobody on the quick-switch list', async () => {
    const { fetchActors, fetchPartByCode } = harness({ actors: [] });

    await expect(resolveScan({ fetchActors, fetchPartByCode, raw: badgeScanToken('stores-person') })).resolves.toEqual({
      kind: 'error',
      message: 'That badge is not recognised. Pick a name from the list instead.',
    });
  });

  it('names the code back when no Part carries it, so the reader knows the label is the problem', async () => {
    const { fetchActors, fetchPartByCode } = harness();

    await expect(resolveScan({ fetchActors, fetchPartByCode, raw: 'BRG-999' })).resolves.toMatchObject({
      kind: 'error',
      message: expect.stringContaining('BRG-999'),
    });
  });

  it('reports a failed badge lookup as a retry rather than an unknown badge', async () => {
    const { fetchActors, fetchPartByCode } = harness({ actorsFail: true });

    await expect(resolveScan({ fetchActors, fetchPartByCode, raw: badgeScanToken('stores-person') })).resolves.toEqual({
      kind: 'error',
      message: 'Couldn’t check that badge. Try again, or pick a name from the list.',
    });
  });

  it('ignores the empty scans a wedge emits on a bad read', async () => {
    const { fetchActors, fetchPartByCode } = harness();

    await expect(resolveScan({ fetchActors, fetchPartByCode, raw: '  ' })).resolves.toEqual({ kind: 'ignored' });
    expect(fetchActors).not.toHaveBeenCalled();
    expect(fetchPartByCode).not.toHaveBeenCalled();
  });
});
