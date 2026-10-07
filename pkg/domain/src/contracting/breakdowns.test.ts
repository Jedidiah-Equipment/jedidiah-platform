import type { ContractingRole } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import { createUserAccessSummary } from '../auth/authorization.js';
import { breakdownFirstLine, breakdownReadScope } from './breakdowns.js';

const access = (contractingRole: ContractingRole) =>
  createUserAccessSummary({ userId: 'me', equipmentRole: null, contractingRole });

describe('breakdownReadScope', () => {
  test('reads every Breakdown with read, only your own with report alone, and none otherwise', () => {
    expect(breakdownReadScope(access('workshop-manager'))).toBe('all');
    expect(breakdownReadScope(access('foreman'))).toBe('own');
    expect(breakdownReadScope(access('contracting-invoicing'))).toBeNull();
    expect(breakdownReadScope(null)).toBeNull();
  });
});

describe('breakdownFirstLine', () => {
  test('takes the first non-blank line and cuts it with an ellipsis', () => {
    expect(breakdownFirstLine('\n  Brake light out  \nAlso a leak')).toBe('Brake light out');
    expect(breakdownFirstLine('a'.repeat(130), 10)).toBe(`${'a'.repeat(9)}…`);
  });
});
