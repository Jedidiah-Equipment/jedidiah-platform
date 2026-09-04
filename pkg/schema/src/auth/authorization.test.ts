import { describe, expect, it } from 'vitest';
import {
  AppPermission,
  AppRole,
  ContractingRole,
  EquipmentRole,
  UserAccessSummary,
  UserPassword,
} from './authorization.js';

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

describe('UserPassword', () => {
  it('accepts non-empty passwords', () => {
    expect(UserPassword.parse('123')).toBe('123');
  });

  it('rejects empty passwords', () => {
    expect(() => UserPassword.parse('')).toThrow();
  });
});
