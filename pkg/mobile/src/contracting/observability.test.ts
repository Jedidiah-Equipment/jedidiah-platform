import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';

const observability = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureEvent: vi.fn(),
  captureSanitizedException: vi.fn(),
}));
vi.mock('@/lib/observability', () => observability);

import {
  CONTRACTING_MUTATION_EVENTS,
  recordFieldNoteChanged,
  recordFieldNoteCreated,
  recordVoiceNoteFailed,
} from './observability';
import { TranscriptionFailedError, TranscriptionRefusedError } from './voice/transcription-errors';

beforeEach(() => {
  vi.clearAllMocks();
});

const MOBILE_ROOT = resolve(import.meta.dirname, '../..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

test('Field Note events carry counts and flags, never the note itself', () => {
  recordFieldNoteCreated({ hasPhoto: true, photoCount: 2, hasDescription: false });
  recordFieldNoteChanged('closed');
  recordFieldNoteChanged('reopened');
  recordFieldNoteChanged('deleted');

  expect(observability.captureEvent.mock.calls).toEqual([
    ['field note created', { hasPhoto: true, photoCount: 2, hasDescription: false }],
    ['field note closed'],
    ['field note reopened'],
    ['field note deleted'],
  ]);
});

test('the catalog covers every Contracting tRPC mutation the phone calls', () => {
  const procedures = new Set<string>();
  for (const directory of ['src/contracting', 'app/(protected)/contracting']) {
    for (const file of sourceFiles(join(MOBILE_ROOT, directory))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/trpc\.((?:[A-Za-z0-9_]+\.)+[A-Za-z0-9_]+)\.mutationOptions/g)) {
        procedures.add(match[1]);
      }
    }
  }

  expect(Object.keys(CONTRACTING_MUTATION_EVENTS).sort()).toEqual([...procedures].sort());
});

test('machine added to job carries the Job and Machine ids only', () => {
  const { properties } = CONTRACTING_MUTATION_EVENTS['contractingJobs.assignments.add'];

  expect(properties({ jobId: 'j', machineId: 'm', implementId: 'i', driverUserId: 'd' })).toEqual({
    jobId: 'j',
    machineId: 'm',
  });
});

const attempt = { purpose: 'field note', seconds: 3, durationMs: 2_800, peakDb: -160, requestMs: 1_045 };

test('a Voice Note refused as silence is an event, while a speech outage is also an exception', () => {
  recordVoiceNoteFailed(
    attempt,
    new TranscriptionRefusedError('transcription.nothing_heard', 'Nothing was heard.', 400),
  );
  recordVoiceNoteFailed(attempt, new TranscriptionRefusedError('transcription.unavailable', 'Unavailable.', 503));

  const refused = { ...attempt, language: null, outcome: 'refused', failure: null };
  expect(observability.captureEvent.mock.calls).toEqual([
    ['voice note transcribed', { ...refused, code: 'transcription.nothing_heard', status: 400 }],
    ['voice note transcribed', { ...refused, code: 'transcription.unavailable', status: 503 }],
  ]);
  expect(observability.captureSanitizedException).toHaveBeenCalledTimes(1);
  expect(observability.captureSanitizedException).toHaveBeenCalledWith(
    expect.any(TranscriptionRefusedError),
    'Voice note transcription refused',
    { ...refused, code: 'transcription.unavailable', status: 503 },
  );
});

test('a Voice Note that got no answer is an exception that says why', () => {
  recordVoiceNoteFailed(attempt, new TranscriptionFailedError('timeout', null));
  recordVoiceNoteFailed(attempt, new Error('The recording is no longer available. Record it again.'));

  const failed = { ...attempt, language: null, outcome: 'failed', code: null, status: null };
  expect(observability.captureSanitizedException.mock.calls).toEqual([
    [expect.any(TranscriptionFailedError), 'Voice note transcription failed', { ...failed, failure: 'timeout' }],
    [expect.any(Error), 'Voice note transcription failed', { ...failed, failure: 'recording' }],
  ]);
});
