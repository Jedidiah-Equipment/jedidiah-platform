import { describe, expect, test } from 'vitest';
import { createUserAccessSummary } from '../auth/authorization.js';
import { fieldJobAccessMode, formatJobNumber, jobReadMode, parseJobNumber } from './jobs.js';

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

describe('jobReadMode', () => {
  test('reads every Job, own Jobs, or Invoicing Jobs, and nothing without a Job read permission', () => {
    const access = (contractingRole: Parameters<typeof createUserAccessSummary>[0]['contractingRole']) =>
      createUserAccessSummary({ userId: 'actor', equipmentRole: null, contractingRole });

    expect(jobReadMode(access('contracting-admin'))).toBe('all');
    expect(jobReadMode(access('foreman'))).toBe('own');
    expect(jobReadMode(access('contracting-invoicing'))).toBe('priced');
    expect(jobReadMode(access('driver'))).toBeNull();
  });
});

test('parseJobNumber reverses formatJobNumber', () => {
  expect(parseJobNumber(formatJobNumber(37))).toBe(37);
  expect(parseJobNumber(formatJobNumber(123456))).toBe(123456);
});
