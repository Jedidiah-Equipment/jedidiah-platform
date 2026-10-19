import type { ContractingRole } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import { createUserAccessSummary } from '../auth/authorization.js';
import { notePushMessage, noteReaches } from './note-threads.js';

const as = (contractingRole: ContractingRole) =>
  createUserAccessSummary({ userId: 'me', equipmentRole: null, contractingRole });

describe('noteReaches', () => {
  const job = { status: 'completed', foremanUserId: 'sipho' } as const;
  const breakdown = { reportedByUserId: 'sipho', jobForemanUserId: 'thabo' };

  test('reaches management on every Job and the Workshop Manager on every Breakdown', () => {
    expect(noteReaches('job', as('contracting-manager'), job, [])).toBe(true);
    expect(noteReaches('breakdown', as('workshop-manager'), breakdown, [])).toBe(true);
    // Reading every Breakdown is not being always reached by its notes.
    expect(noteReaches('breakdown', as('contracting-manager'), breakdown, [])).toBe(false);
  });

  test('reaches the people the record names', () => {
    expect(noteReaches('job', as('foreman'), { ...job, status: 'active', foremanUserId: 'me' }, [])).toBe(true);
    expect(noteReaches('breakdown', as('foreman'), { ...breakdown, reportedByUserId: 'me' }, [])).toBe(true);
    expect(noteReaches('breakdown', as('foreman'), { ...breakdown, jobForemanUserId: 'me' }, [])).toBe(true);
  });

  test('reaches a reader who has noted the thread before, and only them', () => {
    expect(noteReaches('job', as('workshop-manager'), job, [])).toBe(false);
    expect(noteReaches('job', as('workshop-manager'), job, ['me'])).toBe(true);
    expect(noteReaches('breakdown', as('contracting-manager'), breakdown, ['me'])).toBe(true);
  });

  test('never reaches a role the Push Kind cannot reach, even a prior author who can read the record', () => {
    // Contracting Invoicing reads a completed Job but receives no Push Kind: the registry, not the thread, decides.
    expect(noteReaches('job', as('contracting-invoicing'), job, ['me'])).toBe(false);
    expect(noteReaches('job', as('contracting-invoicing'), job, [])).toBe(false);
  });

  test('never reaches someone who can no longer read the record', () => {
    expect(noteReaches('job', as('foreman'), job, ['me'])).toBe(false);
    expect(noteReaches('breakdown', as('foreman'), breakdown, ['me'])).toBe(false);
  });
});

test.each(['job', 'breakdown'] as const)(
  'a long %s note uses a bounded preview without splitting Unicode characters',
  (kind) => {
    const message = notePushMessage({
      kind,
      id: '00000000-0000-4000-8000-000000000001',
      code: 'CJOB-00037',
      authorName: 'Sipho',
      text: '🌾'.repeat(2000),
    });
    expect(message.body).toBe(`Sipho: ${'🌾'.repeat(240)}…`);
  },
);
