import { accessForRole } from '@pkg/domain/testing';
import { describe, expect, it } from 'vitest';

import { storesSelfActor } from './stores-access';

const person = { id: 'manager-1', image: null, isDevice: false, name: 'Lerato Khumalo' };

describe('storesSelfActor', () => {
  /**
   * The Quick-switch lists people under `equipment_inventory:move`, so someone who only counts has no
   * list to pick from — and on their own phone the only honest name for the count is their own.
   */
  it('names the signed-in person when they cannot move stock', () => {
    expect(storesSelfActor({ access: accessForRole('job-manager', 'manager-1'), user: person })).toEqual({
      id: 'manager-1',
      name: 'Lerato Khumalo',
      thumbnailDataUrl: null,
    });
  });

  it('leaves the Quick-switch in charge for anyone who can move stock', () => {
    expect(
      storesSelfActor({ access: accessForRole('admin', 'admin-1'), user: { ...person, id: 'admin-1' } }),
    ).toBeNull();
  });

  it('never names a Device Account', () => {
    expect(
      storesSelfActor({ access: accessForRole('job-manager', 'tablet-1'), user: { ...person, isDevice: true } }),
    ).toBeNull();
  });
});
