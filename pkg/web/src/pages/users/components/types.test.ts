import { AuthId, type UserAccount } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { buildProfileUpdateData, createUserCredentials } from './types.js';
import type { UserCreateFormValues } from './UserCreateForm.js';
import type { UserEditFormValues } from './UserEditForm.js';

const baselineUser: UserAccount = {
  assistantEnabled: false,
  disabled: false,
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

describe('createUserCredentials', () => {
  const person: UserCreateFormValues = {
    contractingRole: 'driver',
    email: '',
    emailVerified: true,
    equipmentRole: null,
    isDevice: false,
    name: 'Sipho',
    password: '',
    phoneNumber: null,
  };

  it('gives a person who cannot sign in an unverified placeholder address of their own', () => {
    const first = createUserCredentials(person);
    const second = createUserCredentials(person);

    expect(first.email).toMatch(/^sipho-[0-9a-f]{6}@fleet\.jedidiah\.invalid$/);
    expect(first.emailVerified).toBe(false);
    expect(first.password).not.toBe('');
    expect(second.email).not.toBe(first.email);
  });

  it("keeps a sign-in role's own email and password", () => {
    const foreman = { ...person, contractingRole: 'foreman' as const, email: 'f@example.com', password: 'secret' };

    expect(createUserCredentials(foreman)).toEqual({ email: 'f@example.com', emailVerified: true, password: 'secret' });
  });
});
