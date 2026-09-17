import { describe, expect, test } from 'vitest';
import { createUserAccessSummary } from '../auth/authorization.js';
import { fieldJobAccessMode } from './jobs.js';

describe('fieldJobAccessMode', () => {
  test('gives management all Jobs, Foremen their own, and keeps workshop readers out of the field queue', () => {
    const access = (contractingRole: Parameters<typeof createUserAccessSummary>[0]['contractingRole']) =>
      createUserAccessSummary({ userId: 'actor', equipmentRole: null, contractingRole });

    expect(fieldJobAccessMode(access('contracting-admin'))).toBe('all');
    expect(fieldJobAccessMode(access('contracting-manager'))).toBe('all');
    expect(fieldJobAccessMode(access('foreman'))).toBe('own');
    expect(fieldJobAccessMode(access('workshop-manager'))).toBeNull();
  });
});
