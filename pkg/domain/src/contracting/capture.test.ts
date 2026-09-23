import { describe, expect, test } from 'vitest';
import { type CaptureAttempt, type CaptureWorld, captureRefusal, judgeCapture } from './capture.js';

const world = (overrides: Partial<CaptureWorld> = {}): CaptureWorld => ({
  latest: { id: 'latest', value: 100 },
  stint: 'planned',
  onSite: [],
  management: false,
  hasPhoto: true,
  ...overrides,
});

const capture = (overrides: Partial<CaptureAttempt> = {}): CaptureAttempt => ({
  role: 'arrival',
  value: 120,
  machineId: 'tractor',
  implementId: null,
  disputePrevious: false,
  expectedPreviousId: undefined,
  comment: null,
  ...overrides,
});

describe('judgeCapture', () => {
  test.each<[string, CaptureWorld, CaptureAttempt, ReturnType<typeof judgeCapture>]>([
    [
      'accepts an idle machine reading its latest value',
      world(),
      capture({ value: 100 }),
      { ok: true, disputes: null },
    ],
    [
      'accepts the first reading of an empty ledger',
      world({ latest: null }),
      capture({ value: 3 }),
      { ok: true, disputes: null },
    ],
    [
      'refuses a value below the latest without a dispute',
      world(),
      capture({ value: 90 }),
      { ok: false, reason: 'reading.below_latest', rule: 'below-latest' },
    ],
    [
      'accepts a value below the latest when the capturer disputes the latest, and names it',
      world(),
      capture({ value: 90, disputePrevious: true, expectedPreviousId: 'latest' }),
      { ok: true, disputes: 'latest' },
    ],
    [
      'disputes nothing when a capture flagged as a dispute is not below the latest',
      world(),
      capture({ value: 110, disputePrevious: true, expectedPreviousId: 'latest' }),
      { ok: true, disputes: null },
    ],
    [
      'refuses a dispute aimed at a reading that is no longer the latest',
      world(),
      capture({ value: 90, disputePrevious: true, expectedPreviousId: 'older' }),
      { ok: false, reason: 'reading.previous_changed', rule: 'previous-changed' },
    ],
    [
      'refuses a manager’s departure with no photo and no comment',
      world({ stint: 'on-site', management: true, hasPhoto: false }),
      capture({ role: 'departure' }),
      { ok: false, reason: 'reading.invalid_role', rule: 'comment-required' },
    ],
    [
      'accepts a manager’s photo-less departure that says why',
      world({ stint: 'on-site', management: true, hasPhoto: false }),
      capture({ role: 'departure', comment: 'Camera broken' }),
      { ok: true, disputes: null },
    ],
    [
      'accepts a Foreman’s photo-less departure without a comment',
      world({ stint: 'on-site', hasPhoto: false }),
      capture({ role: 'departure' }),
      { ok: true, disputes: null },
    ],
    [
      'refuses a second arrival on a stint already on site',
      world({ stint: 'on-site' }),
      capture(),
      { ok: false, reason: 'reading.invalid_role', rule: 'already-arrived' },
    ],
    [
      'refuses an arrival on a stint that has left',
      world({ stint: 'left' }),
      capture(),
      { ok: false, reason: 'reading.invalid_role', rule: 'already-arrived' },
    ],
    [
      'refuses a departure on a stint that never arrived',
      world({ stint: 'planned' }),
      capture({ role: 'departure' }),
      { ok: false, reason: 'reading.invalid_role', rule: 'not-on-site' },
    ],
    [
      'refuses a departure on a stint that has already left',
      world({ stint: 'left' }),
      capture({ role: 'departure' }),
      { ok: false, reason: 'reading.invalid_role', rule: 'not-on-site' },
    ],
    [
      'refuses an arrival for a Machine on site on another Job, naming the Job',
      world({ onSite: [{ machineId: 'tractor', implementId: null, jobNumber: 'CJOB-00041' }] }),
      capture(),
      { ok: false, reason: 'reading.machine_on_site', rule: 'machine-busy', jobNumber: 'CJOB-00041' },
    ],
    [
      'refuses an arrival bringing an Implement on site elsewhere, naming the Job',
      world({ onSite: [{ machineId: 'digger', implementId: 'disc', jobNumber: 'CJOB-00007' }] }),
      capture({ implementId: 'disc' }),
      { ok: false, reason: 'reading.implement_on_site', rule: 'implement-busy', jobNumber: 'CJOB-00007' },
    ],
    [
      'starts a stint on a free Machine',
      world({ stint: null, onSite: [{ machineId: 'digger', implementId: null, jobNumber: 'CJOB-00007' }] }),
      capture(),
      { ok: true, disputes: null },
    ],
    [
      'accepts a spot reading whatever is on site',
      world({ stint: null, onSite: [{ machineId: 'tractor', implementId: null, jobNumber: 'CJOB-00041' }] }),
      capture({ role: 'spot' }),
      { ok: true, disputes: null },
    ],
  ])('%s', (_name, given, attempt, expected) => {
    expect(judgeCapture(given, attempt)).toEqual(expected);
  });
});

describe('captureRefusal', () => {
  test('says why in the words the phone and the server both show', () => {
    const refuse = (w: CaptureWorld, c: CaptureAttempt) => {
      const verdict = judgeCapture(w, c);
      if (verdict.ok) throw new Error('Expected a refusal');
      return captureRefusal(verdict);
    };
    expect(refuse(world(), capture({ value: 90 }))).toBe(
      'Reading is below the latest reading. Retake it or assert that the previous reading is wrong.',
    );
    expect(refuse(world(), capture({ value: 90, disputePrevious: true, expectedPreviousId: 'older' }))).toBe(
      'Another reading landed first. Review the latest reading before resubmitting a dispute.',
    );
    expect(refuse(world({ stint: 'on-site', management: true, hasPhoto: false }), capture({ role: 'departure' }))).toBe(
      'A reason is required for a photo-less departure reading.',
    );
    expect(refuse(world({ stint: 'on-site' }), capture())).toBe('This Machine Assignment already arrived.');
    expect(refuse(world(), capture({ role: 'departure' }))).toBe('This Machine Assignment is not on site.');
    expect(
      refuse(world({ onSite: [{ machineId: 'tractor', implementId: null, jobNumber: 'CJOB-00041' }] }), capture()),
    ).toBe('This Machine is still on site on CJOB-00041 — capture its departure there first.');
    expect(captureRefusal({ ok: false, reason: 'reading.machine_on_site', rule: 'machine-busy' })).toBe(
      'This Machine is still on site on another Job — capture its departure there first.',
    );
    expect(
      captureRefusal({
        ok: false,
        reason: 'reading.implement_on_site',
        rule: 'implement-busy',
        jobNumber: 'CJOB-00007',
      }),
    ).toBe('This Implement is still on site on CJOB-00007 — capture its departure there first.');
  });
});
