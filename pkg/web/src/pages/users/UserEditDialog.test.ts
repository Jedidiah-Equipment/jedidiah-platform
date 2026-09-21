import { AuthId, type UserAccount } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import type { UserEditFormValues } from './components/UserEditForm.js';
import { buildProfileUpdateData } from './user-profile-update.js';

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
  quoteSalesperson: false,
  thumbnailDataUrl: null,
};

const value: UserEditFormValues = { ...baselineUser, quoteSalesperson: true };

describe('buildProfileUpdateData', () => {
  it('sends a changed Quote salesperson flag for user:update', () => {
    expect(
      buildProfileUpdateData({ baselineUser, canSetEmail: false, canSetRole: false, canUpdateProfile: true, value }),
    ).toEqual({
      quoteSalesperson: true,
    });
  });

  it('omits an unchanged flag and a change without user:update', () => {
    expect(
      buildProfileUpdateData({
        baselineUser,
        canSetEmail: false,
        canSetRole: false,
        canUpdateProfile: true,
        value: baselineUser,
      }),
    ).toEqual({});
    expect(
      buildProfileUpdateData({ baselineUser, canSetEmail: false, canSetRole: true, canUpdateProfile: false, value }),
    ).toEqual({});
  });
});
