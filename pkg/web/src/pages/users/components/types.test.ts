import { AuthId, type UserAccount } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { buildProfileUpdateData } from './types.js';
import type { UserEditFormValues } from './UserEditForm.js';

const baselineUser: UserAccount = {
  assistantEnabled: false,
  contractingRole: null,
  email: 'sales@example.com',
  emailVerified: true,
  equipmentRole: 'sales',
  id: AuthId.parse('sales-id'),
  isDevice: false,
  name: 'Sales User',
  phoneNumber: null,
  thumbnailDataUrl: null,
};

const value: UserEditFormValues = {
  ...baselineUser,
  assistantEnabled: true,
  email: 'renamed@example.com',
  emailVerified: false,
  equipmentRole: 'admin',
  name: 'Renamed User',
  phoneNumber: '+27821234567',
};

describe('buildProfileUpdateData', () => {
  it('sends only the changed fields the caller may set', () => {
    expect(
      buildProfileUpdateData({ baselineUser, canSetEmail: true, canSetRole: true, canUpdateProfile: true, value }),
    ).toEqual({
      assistantEnabled: true,
      email: 'renamed@example.com',
      emailVerified: false,
      equipmentRole: 'admin',
      name: 'Renamed User',
      phoneNumber: '+27821234567',
    });
  });

  it('keeps each field behind its own permission', () => {
    expect(
      buildProfileUpdateData({ baselineUser, canSetEmail: false, canSetRole: false, canUpdateProfile: true, value }),
    ).toEqual({ assistantEnabled: true, name: 'Renamed User', phoneNumber: '+27821234567' });
    expect(
      buildProfileUpdateData({ baselineUser, canSetEmail: true, canSetRole: false, canUpdateProfile: false, value }),
    ).toEqual({ email: 'renamed@example.com', emailVerified: false });
    expect(
      buildProfileUpdateData({ baselineUser, canSetEmail: false, canSetRole: true, canUpdateProfile: false, value }),
    ).toEqual({ equipmentRole: 'admin' });
  });

  it('sends nothing when nothing changed', () => {
    expect(
      buildProfileUpdateData({
        baselineUser,
        canSetEmail: true,
        canSetRole: true,
        canUpdateProfile: true,
        value: baselineUser,
      }),
    ).toEqual({});
  });
});
