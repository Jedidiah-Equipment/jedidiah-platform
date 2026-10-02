import { describe, expect, it } from 'vitest';

import { buildPermissionMatrix } from './permission-matrix-model.js';

describe('buildPermissionMatrix', () => {
  it('gives Contracting its own roles plus the spanning super-admin, and only contracting permissions', () => {
    const matrix = buildPermissionMatrix('contracting');

    expect(matrix.roles).toEqual([
      'super-admin',
      'contracting-admin',
      'contracting-manager',
      'workshop-manager',
      'foreman',
      'contracting-invoicing',
      'driver',
      'mechanic',
    ]);
    expect(matrix.permissions.length).toBeGreaterThan(0);
    expect(matrix.permissions.every((permission) => permission.startsWith('contracting_'))).toBe(true);
    expect(matrix.permissionsByRole.get('super-admin')?.has('contracting_job:read')).toBe(true);
  });

  it('keeps user administration on the Equipment grid', () => {
    const matrix = buildPermissionMatrix('equipment');

    expect(matrix.roles).not.toContain('foreman');
    expect(matrix.permissions).toContain('user:list');
    expect(matrix.permissions.some((permission) => permission.startsWith('contracting_'))).toBe(false);
  });
});
