import { expect, test } from 'vitest';
import { captureAttempt } from './capture-attempt';

test('a retry of an unchanged form reuses the attempt, and any change starts a new one', () => {
  const first = captureAttempt(null, ['spot', 120, null]);
  expect(first.localId).toMatch(/^[0-9a-f-]{36}$/);
  expect(captureAttempt(first, ['spot', 120, null])).toBe(first);

  const changed = captureAttempt(first, ['spot', 121, null]);
  expect(changed.localId).not.toBe(first.localId);
  expect(changed.fingerprint).not.toBe(first.fingerprint);
});
