import { describe, expect, it } from 'vitest';
import { UserAccount } from './user.js';

describe('UserAccount', () => {
  it('parses a sign-in account with both role slots', () => {
    expect(
      UserAccount.parse({
        assistantEnabled: false,
        email: 'user@example.com',
        emailVerified: true,
        isDevice: false,
        id: 'user_123',
        name: 'User Example',
        phoneNumber: null,
        contractingRole: null,
        equipmentRole: 'sales',
        thumbnailDataUrl: null,
      }),
    ).toEqual({
      assistantEnabled: false,
      email: 'user@example.com',
      emailVerified: true,
      isDevice: false,
      id: 'user_123',
      name: 'User Example',
      phoneNumber: null,
      contractingRole: null,
      equipmentRole: 'sales',
      thumbnailDataUrl: null,
    });
  });
});
