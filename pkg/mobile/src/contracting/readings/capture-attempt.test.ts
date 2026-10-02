import { expect, test } from 'vitest';
import { captureAttempt, captureAttemptPayload } from './capture-attempt';

test('a retry of an unchanged form reuses the attempt, and any change starts a new one', () => {
  const first = captureAttempt(null, ['spot', 120, null]);
  expect(first.localId).toMatch(/^[0-9a-f-]{36}$/);
  expect(captureAttempt(first, ['spot', 120, null])).toBe(first);

  const changed = captureAttempt(first, ['spot', 121, null]);
  expect(changed.localId).not.toBe(first.localId);
  expect(changed.fingerprint).not.toBe(first.fingerprint);
});

test('editing Read At after a failed attempt mints a new attempt, so the server does not see an id conflict', () => {
  const form = {
    role: 'spot',
    assignmentId: null,
    value: 120,
    photo: null,
    comment: ' ',
    disputedReadingId: null,
    stintOverrides: null,
    readAt: null,
  };
  const first = captureAttempt(null, captureAttemptPayload(form));
  expect(captureAttempt(first, captureAttemptPayload({ ...form, comment: '' }))).toBe(first);
  const backdated = captureAttempt(first, captureAttemptPayload({ ...form, readAt: new Date('2026-10-01T05:30:00Z') }));
  expect(backdated.localId).not.toBe(first.localId);
  expect(captureAttempt(first, captureAttemptPayload({ ...form, disputedReadingId: 'r1' })).localId).not.toBe(
    first.localId,
  );
});
