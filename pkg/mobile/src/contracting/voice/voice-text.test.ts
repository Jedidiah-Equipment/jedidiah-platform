import { expect, test } from 'vitest';
import { withTranscript } from './voice-text';

test('appends the transcript after typed text and keeps within the field limit', () => {
  expect(withTranscript('', 'Gate is open.')).toBe('Gate is open.');
  expect(withTranscript('Arrived late.', 'Gate is open.', 20)).toBe('Arrived late. Gate i');
});
