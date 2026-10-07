import { afterEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/api-base-url', () => ({ apiBaseUrl: 'https://api.jedidiah.test' }));
vi.mock('@/lib/auth', () => ({ sessionCookieHeader: async () => 'better-auth.session_token=secret' }));
vi.mock('@/lib/file-part', () => ({ filePart: async () => new Blob(['voice'], { type: 'audio/mp4' }) }));

import { transcribeRecording } from './transcribe-upload';

const transcription = { id: '5f1c2d3e-0001-4a00-8000-000000000001', text: 'Die hek is oop.', language: 'afr' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('sends the purpose and recording with the session cookie and returns the text', async () => {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    expect(url).toBe('https://api.jedidiah.test/api/contracting/transcriptions');
    expect(new Headers(init.headers).get('Cookie')).toBe('better-auth.session_token=secret');
    const body = init.body as FormData;
    expect(body.get('purpose')).toBe('capture comment');
    expect(await (body.get('audio') as Blob).text()).toBe('voice');
    return Response.json(transcription, { status: 201 });
  });

  await expect(transcribeRecording('file:///voice.m4a', 'capture comment')).resolves.toEqual(transcription);
});

test('a speech outage is the server’s refusal, with its status for the trail', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      { message: 'Voice notes are not set up. Type the note instead.', data: { appCode: 'transcription.unavailable' } },
      { status: 503 },
    ),
  );
  await expect(transcribeRecording('file:///voice.m4a', 'field note')).rejects.toMatchObject({
    name: 'UploadRefusedError',
    data: { appCode: 'transcription.unavailable' },
    message: 'Voice notes are not set up. Type the note instead.',
    status: 503,
  });
});

test('gives up once the transcribe timeout passes', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
  );
  const pending = expect(transcribeRecording('file:///voice.m4a', 'field note')).rejects.toMatchObject({
    name: 'UploadFailedError',
    reason: 'timeout',
  });
  await vi.advanceTimersByTimeAsync(30_000);
  await pending;
});
