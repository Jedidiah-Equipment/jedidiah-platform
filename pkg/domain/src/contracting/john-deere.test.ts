import type { JohnDeerePollSummary } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { johnDeerePollMessage } from './john-deere.js';

const run = (overrides: Partial<JohnDeerePollSummary>): JohnDeerePollSummary => ({
  skipped: null,
  polled: 0,
  stored: 0,
  moved: 0,
  unchanged: 0,
  lost: 0,
  errors: 0,
  endedBy: null,
  ...overrides,
});

describe('johnDeerePollMessage', () => {
  it('says why a run never started', () => {
    expect(johnDeerePollMessage(run({ skipped: 'not-connected' }))).toBe(
      'John Deere is not connected, so nothing was read.',
    );
    expect(johnDeerePollMessage(run({ skipped: 'no-links' }))).toBe('No Machines are linked to John Deere yet.');
  });

  it('counts what became of each polled machine', () => {
    expect(johnDeerePollMessage(run({ polled: 3, stored: 1, moved: 1, unchanged: 1 }))).toBe(
      'Polled 3 machines: 1 new reading, 1 moved forward, 1 unchanged.',
    );
    expect(johnDeerePollMessage(run({ polled: 1, stored: 2, lost: 1, errors: 2 }))).toBe(
      'Polled 1 machine: 2 new readings, 1 no longer listed by John Deere, 2 failures.',
    );
  });

  it('names the error that ended the run early', () => {
    expect(
      johnDeerePollMessage(run({ polled: 2, unchanged: 2, endedBy: 'John Deere is unavailable right now.' })),
    ).toBe('Polled 2 machines: 2 unchanged. The run stopped early: John Deere is unavailable right now.');
  });
});
