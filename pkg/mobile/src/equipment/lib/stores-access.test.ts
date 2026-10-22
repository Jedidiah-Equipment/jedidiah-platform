import { accessForRole } from '@pkg/domain/testing';
import { describe, expect, it } from 'vitest';

import { storesSelfActor } from './stores-access';

const person = { id: 'manager-1', image: null, isDevice: false, name: 'Lerato Khumalo' };

describe('storesSelfActor', () => {
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
