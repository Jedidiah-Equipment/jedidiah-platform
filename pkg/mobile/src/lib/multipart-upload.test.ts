import { shouldReportApiMutationError } from '@pkg/schema';
import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';

vi.mock('./api-base-url', () => ({ apiBaseUrl: 'https://api.jedidiah.test' }));
vi.mock('./auth', () => ({ sessionCookieHeader: async () => 'better-auth.session_token=secret' }));

import { postMultipart, UploadFailedError, UploadRefusedError } from './multipart-upload';

const FAILED = 'Could not send it.';
const options = { timeoutMs: 10_000, failedMessage: FAILED };
const post = (output?: z.ZodType<unknown>) => postMultipart('/api/upload', new FormData(), { ...options, output });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('posts the body with the session cookie and answers the parsed JSON, or nothing when there is none', async () => {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    expect(url).toBe('https://api.jedidiah.test/api/upload');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Cookie')).toBe('better-auth.session_token=secret');
    return Response.json({ id: 'row-1' }, { status: 201 });
  });
  await expect(post()).resolves.toEqual({ id: 'row-1' });

  vi.stubGlobal('fetch', async () => new Response('<html>', { status: 201 }));
  await expect(post()).resolves.toBeUndefined();
});

test('a 2xx that does not fit the expected answer is a server failure', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ id: 42 }, { status: 201 }));
  await expect(post(z.object({ id: z.string() }))).rejects.toMatchObject({
    name: 'UploadFailedError',
    reason: 'server',
    status: 201,
    message: FAILED,
  });
});

test('a refusal is the server’s own sentence and code, shaped so the mutation cache never reports it', async () => {
  for (const status of [400, 409, 503]) {
    vi.stubGlobal('fetch', async () =>
      Response.json({ data: { appCode: 'reading.below_latest' }, message: 'Retake or dispute' }, { status }),
    );
    const refusal = await post().catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(UploadRefusedError);
    expect(refusal).toMatchObject({ data: { appCode: 'reading.below_latest' }, message: 'Retake or dispute', status });
    expect(shouldReportApiMutationError(refusal)).toBe(false);
  }
});

test('signed-out, retry-later, unexplained and 5xx answers are failures that carry the status', async () => {
  for (const status of [401, 408, 429, 500, 502]) {
    vi.stubGlobal('fetch', async () => Response.json({ data: { appCode: 'reading.refused' } }, { status }));
    const failure = await post().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(UploadFailedError);
    expect(failure).toMatchObject({ reason: 'server', status, message: FAILED });
    expect(shouldReportApiMutationError(failure)).toBe(true);
  }
  // A refusal status without the server's reason is a failure too: there is no sentence to show.
  vi.stubGlobal('fetch', async () => new Response('<html>', { status: 404 }));
  await expect(post()).rejects.toMatchObject({ name: 'UploadFailedError', reason: 'server', status: 404 });
});

test('a dropped connection is a network failure', async () => {
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('Network request failed');
  });
  await expect(post()).rejects.toMatchObject({
    name: 'UploadFailedError',
    reason: 'network',
    status: null,
    message: FAILED,
    cause: expect.any(TypeError),
  });
});

test('gives up once the timeout passes', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
  );
  const pending = expect(post()).rejects.toMatchObject({ name: 'UploadFailedError', reason: 'timeout', status: null });
  await vi.advanceTimersByTimeAsync(10_000);
  await pending;
});
