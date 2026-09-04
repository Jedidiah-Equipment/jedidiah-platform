import { describe, expect, it } from 'vitest';
import { UserAccount, UserSummary } from './user.js';

describe('UserSummary', () => {
  it('requires department memberships', () => {
    expect(() =>
      UserSummary.parse({
        email: 'user@example.com',
        emailVerified: true,
        isDevice: false,
        id: 'user_123',
        name: 'User Example',
        contractingRole: null,
        equipmentRole: 'sales',
      }),
    ).toThrow();

    expect(
      UserSummary.parse({
        assistantEnabled: false,
        departments: ['supply'],
        email: 'user@example.com',
        emailVerified: true,
        isDevice: false,
        id: 'user_123',
        name: 'User Example',
        phoneNumber: null,
        contractingRole: null,
        equipmentRole: 'sales',
        thumbnailDataUrl: null,
      }).departments,
    ).toEqual(['supply']);
  });
});

describe('UserAccount', () => {
  it('parses a user without department memberships', () => {
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
