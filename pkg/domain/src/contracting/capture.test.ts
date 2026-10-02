import { describe, expect, test } from 'vitest';
import {
  type CaptureAttempt,
  type CaptureWorld,
  captureIsBelowLatest,
  captureNeedsComment,
  captureRefusal,
  FUTURE_READ_AT_TOLERANCE_MS,
  isFutureReadAt,
  judgeCapture,
} from './capture.js';

const world = (overrides: Partial<CaptureWorld> = {}): CaptureWorld => ({
  latest: { id: 'latest', value: 100 },
  stint: 'planned',
  management: false,
  hasPhoto: true,
  ...overrides,
});

const capture = (overrides: Partial<CaptureAttempt> = {}): CaptureAttempt => ({
  role: 'arrival',
  value: 120,
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
      'accepts a spot reading with no stint',
      world({ stint: null }),
      capture({ role: 'spot' }),
      { ok: true, disputes: null },
    ],
  ])('%s', (_name, given, attempt, expected) => {
    expect(judgeCapture(given, attempt)).toEqual(expected);
  });
});

describe('captureRefusal', () => {
  test('says why in the one sentence the server sends', () => {
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
    expect(captureRefusal({ ok: false, reason: 'reading.machine_on_site', rule: 'machine-busy' })).toBe(
      'This Machine is still on site on another Job — capture its departure there first.',
    );
    expect(captureRefusal({ ok: false, reason: 'reading.implement_on_site', rule: 'implement-busy' })).toBe(
      'This Implement is still on site on another Job — capture its departure there first.',
    );
  });
});

describe('capture hints', () => {
  test('below the latest reading only when a latest exists and the value is under it', () => {
    expect(captureIsBelowLatest(90, { value: 100 })).toBe(true);
    expect(captureIsBelowLatest(100, { value: 100 })).toBe(false);
    expect(captureIsBelowLatest(90, null)).toBe(false);
  });

  test("only management's photo-less departure needs a comment", () => {
    expect(captureNeedsComment('departure', { management: true, hasPhoto: false })).toBe(true);
    expect(captureNeedsComment('departure', { management: true, hasPhoto: true })).toBe(false);
    expect(captureNeedsComment('departure', { management: false, hasPhoto: false })).toBe(false);
    expect(captureNeedsComment('arrival', { management: true, hasPhoto: false })).toBe(false);
  });
});

describe('isFutureReadAt', () => {
  const now = new Date('2026-10-01T10:00:00Z');

  test('is true one millisecond ahead and false at now', () => {
    expect(isFutureReadAt(new Date(now.getTime() + 1), now)).toBe(true);
    expect(isFutureReadAt(now, now)).toBe(false);
  });

  test('allows the tolerance: false at now + tolerance, true one millisecond past it', () => {
    const limit = new Date(now.getTime() + FUTURE_READ_AT_TOLERANCE_MS);
    expect(isFutureReadAt(limit, now, FUTURE_READ_AT_TOLERANCE_MS)).toBe(false);
    expect(isFutureReadAt(new Date(limit.getTime() + 1), now, FUTURE_READ_AT_TOLERANCE_MS)).toBe(true);
  });
});
