import { beforeEach, expect, test, vi } from 'vitest';

const observability = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureEvent: vi.fn(),
  captureSanitizedException: vi.fn(),
}));
vi.mock('@/lib/observability', () => observability);
vi.mock('@/lib/authed-fetch', () => ({ authedFetch: vi.fn() }));

import { UploadFailedError, UploadRefusedError } from '@/lib/multipart-upload';
import { recordVoiceNoteFailed } from './voice-observability';

beforeEach(() => {
  vi.clearAllMocks();
});

const attempt = {
  business: 'contracting' as const,
  purpose: 'field note',
  seconds: 3,
  durationMs: 2_800,
  peakDb: -160,
  requestMs: 1_045,
};

test('a Voice Note refused as silence is an event, while a speech outage is also an exception', () => {
  recordVoiceNoteFailed(attempt, new UploadRefusedError('transcription.nothing_heard', 'Nothing was heard.', 400));
  recordVoiceNoteFailed(attempt, new UploadRefusedError('transcription.unavailable', 'Unavailable.', 503));

  const refused = { ...attempt, language: null, outcome: 'refused', failure: null };
  expect(observability.captureEvent.mock.calls).toEqual([
    ['voice note transcribed', { ...refused, code: 'transcription.nothing_heard', status: 400 }],
    ['voice note transcribed', { ...refused, code: 'transcription.unavailable', status: 503 }],
  ]);
  expect(observability.captureSanitizedException).toHaveBeenCalledTimes(1);
  expect(observability.captureSanitizedException).toHaveBeenCalledWith(
    expect.any(UploadRefusedError),
    'Voice note transcription refused',
    { ...refused, code: 'transcription.unavailable', status: 503 },
  );
});

test('a Voice Note that got no answer is an exception that says why', () => {
  recordVoiceNoteFailed(attempt, new UploadFailedError('Transcription failed', 'timeout', null));
  recordVoiceNoteFailed(attempt, new Error('The recording is no longer available. Record it again.'));

  const failed = { ...attempt, language: null, outcome: 'failed', code: null, status: null };
  expect(observability.captureSanitizedException.mock.calls).toEqual([
    [expect.any(UploadFailedError), 'Voice note transcription failed', { ...failed, failure: 'timeout' }],
    [expect.any(Error), 'Voice note transcription failed', { ...failed, failure: 'recording' }],
  ]);
});

test('the breadcrumb is filed under the business the note was spoken in', () => {
  recordVoiceNoteFailed(
    { ...attempt, business: 'equipment' },
    new UploadRefusedError('transcription.nothing_heard', 'Nothing was heard.', 400),
  );

  expect(observability.addBreadcrumb).toHaveBeenCalledWith('equipment', 'voice note transcribed', expect.anything());
});
