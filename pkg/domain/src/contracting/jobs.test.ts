import { jobQueues } from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import { createUserAccessSummary } from '../auth/authorization.js';
import {
  canOpenJobCards,
  fieldJobAccessMode,
  formatJobNumber,
  jobQueueLabels,
  jobQueueStatus,
  jobReadMode,
  parseJobNumber,
} from './jobs.js';

describe('fieldJobAccessMode', () => {
  test('gives management all Jobs, Foremen their own, and keeps workshop readers out of the field queue', () => {
    const access = (contractingRole: Parameters<typeof createUserAccessSummary>[0]['contractingRole']) =>
      createUserAccessSummary({ userId: 'actor', equipmentRole: null, contractingRole });

    expect(fieldJobAccessMode(access('contracting-admin'))).toBe('all');
    expect(fieldJobAccessMode(access('contracting-manager'))).toBe('all');
    expect(fieldJobAccessMode(access('foreman'))).toBe('own');
    expect(fieldJobAccessMode(access('workshop-manager'))).toBeNull();
    const superAdmin = createUserAccessSummary({
      userId: 'owner',
      equipmentRole: 'super-admin',
      contractingRole: null,
    });
    expect(fieldJobAccessMode(superAdmin)).toBe('all');
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

describe('canOpenJobCards', () => {
  test('opens Job Cards for whoever reads Jobs with money', () => {
    const access = (contractingRole: Parameters<typeof createUserAccessSummary>[0]['contractingRole']) =>
      createUserAccessSummary({ userId: 'actor', equipmentRole: null, contractingRole });

    expect(canOpenJobCards(access('contracting-admin'))).toBe(true);
    expect(canOpenJobCards(access('contracting-manager'))).toBe(true);
    expect(canOpenJobCards(access('workshop-manager'))).toBe(true);
    expect(canOpenJobCards(access('contracting-invoicing'))).toBe(true);
    expect(canOpenJobCards(access('foreman'))).toBe(false);
    expect(canOpenJobCards(access('driver'))).toBe(false);
    expect(canOpenJobCards(null)).toBe(false);
  });
});

test('parseJobNumber reverses formatJobNumber', () => {
  expect(parseJobNumber(formatJobNumber(37))).toBe(37);
  expect(parseJobNumber(formatJobNumber(123456))).toBe(123456);
});

describe('job queues', () => {
  test('every queue names the status its Jobs hold', () => {
    expect(jobQueueStatus['looks-finished']).toBe('active');
    expect(Object.keys(jobQueueStatus).sort()).toEqual([...jobQueues].sort());
    expect(Object.keys(jobQueueLabels).sort()).toEqual([...jobQueues].sort());
  });
});
