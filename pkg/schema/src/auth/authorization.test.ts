import { describe, expect, it } from 'vitest';
import { Department } from '../common/departments.js';
import {
  AppPermission,
  AppRole,
  ContractingRole,
  EquipmentRole,
  UserAccessSummary,
  UserAccount,
  UserPassword,
  UserSummary,
} from './authorization.js';

describe('Department', () => {
  it('accepts supported job departments', () => {
    expect(Department.parse('procurement')).toBe('procurement');
    expect(Department.parse('fabrication')).toBe('fabrication');
    expect(Department.parse('paint')).toBe('paint');
    expect(Department.parse('assembly')).toBe('assembly');
    expect(Department.parse('workshop')).toBe('workshop');
    expect(Department.parse('supply')).toBe('supply');
  });

  it('rejects unsupported department values', () => {
    expect(() => Department.parse('engineering')).toThrow();
  });
});

describe('AppRole', () => {
  it('accepts app roles', () => {
    expect(AppRole.parse('admin')).toBe('admin');
    expect(AppRole.parse('super-admin')).toBe('super-admin');
    expect(AppRole.parse('procurement-manager')).toBe('procurement-manager');
    expect(AppRole.parse('job-manager')).toBe('job-manager');
    expect(AppRole.parse('job-viewer')).toBe('job-viewer');
    expect(AppRole.parse('sales')).toBe('sales');
    expect(AppRole.parse('stores')).toBe('stores');
    expect(AppRole.parse('bay-operator')).toBe('bay-operator');
    expect(AppRole.parse('contracting-admin')).toBe('contracting-admin');
    expect(AppRole.parse('contracting-manager')).toBe('contracting-manager');
    expect(AppRole.parse('workshop-manager')).toBe('workshop-manager');
    expect(AppRole.parse('foreman')).toBe('foreman');
    expect(AppRole.parse('contracting-invoicing')).toBe('contracting-invoicing');
    expect(AppRole.parse('driver')).toBe('driver');
    expect(AppRole.parse('mechanic')).toBe('mechanic');
  });

  it('rejects retired app roles', () => {
    expect(() => AppRole.parse('job-department-manager')).toThrow();
  });
});

describe('business role slots', () => {
  it('keeps equipment and contracting roles in separate enums', () => {
    expect(EquipmentRole.parse('sales')).toBe('sales');
    expect(ContractingRole.parse('foreman')).toBe('foreman');
    expect(() => EquipmentRole.parse('foreman')).toThrow();
    expect(() => ContractingRole.parse('sales')).toThrow();
  });
});

describe('AppPermission', () => {
  it('accepts app permissions', () => {
    expect(AppPermission.parse('equipment_job:read')).toBe('equipment_job:read');
    expect(AppPermission.parse('equipment_email:send')).toBe('equipment_email:send');
    expect(AppPermission.parse('equipment_part:update')).toBe('equipment_part:update');
    expect(AppPermission.parse('equipment_quote:cancel')).toBe('equipment_quote:cancel');
    expect(AppPermission.parse('equipment_inventory:close-out')).toBe('equipment_inventory:close-out');
    expect(AppPermission.parse('contracting_job:read-own')).toBe('contracting_job:read-own');
    expect(AppPermission.parse('contracting_assignment:update-own')).toBe('contracting_assignment:update-own');
    expect(AppPermission.parse('contracting_breakdown:update')).toBe('contracting_breakdown:update');
    expect(AppPermission.parse('contracting_invoice:update')).toBe('contracting_invoice:update');
  });

  it('rejects retired permissions', () => {
    expect(() => AppPermission.parse('user:assign-departments')).toThrow();
    expect(() => AppPermission.parse('quote:discount')).toThrow();
    expect(() => AppPermission.parse('job:read')).toThrow();
  });
});

describe('UserAccessSummary', () => {
  it('carries no department memberships', () => {
    expect(
      UserAccessSummary.parse({
        permissions: [],
        contractingRole: null,
        equipmentRole: 'sales',
        userId: 'user_123',
      }),
    ).toEqual({
      permissions: [],
      contractingRole: null,
      equipmentRole: 'sales',
      userId: 'user_123',
    });
  });
});

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

describe('UserPassword', () => {
  it('accepts non-empty passwords', () => {
    expect(UserPassword.parse('123')).toBe('123');
  });

  it('rejects empty passwords', () => {
    expect(() => UserPassword.parse('')).toThrow();
  });
});
