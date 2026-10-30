import { afterEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/api-base-url', () => ({ apiBaseUrl: 'https://api.jedidiah.test' }));
vi.mock('@/lib/auth', () => ({ sessionCookieHeader: async () => 'better-auth.session_token=secret' }));

import { CAPTURE_FAILED, captureReading } from './reading-upload';

const input = {
  localId: '5f1c2d3e-0001-4a00-8000-000000000001',
  machineId: '2c1e8a0e-2f7f-4a5b-9d3a-6f0b1c2d3e4f',
  role: 'spot' as const,
  value: 12.3,
  capturedAt: '2026-09-08T08:00:00Z',
  disputePrevious: false,
  expectedPreviousId: '8766e188-5041-4d7c-98f2-cbd47dca3c01',
  comment: 'Glass cracked, digits hard to read',
};

const answer = (respond: (url: string, init: RequestInit) => Promise<Response>) => {
  vi.stubGlobal('fetch', respond);
};

afterEach(() => vi.unstubAllGlobals());

test('sends the capture as JSON with the session cookie, leaving out a blank comment', async () => {
  answer(async (url, init) => {
    expect(url).toBe('https://api.jedidiah.test/api/contracting/readings');
    const headers = new Headers(init.headers);
    expect(headers.get('Cookie')).toBe('better-auth.session_token=secret');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(input);
    return new Response('<html>', { status: 201 });
  });
  await expect(captureReading(input)).resolves.toBeUndefined();

  answer(async (_url, init) => {
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty('comment');
    expect(body).not.toHaveProperty('expectedPreviousId');
    return new Response(null, { status: 201 });
  });
  await captureReading({ ...input, comment: '', expectedPreviousId: undefined });
});

test('separates the server’s refusals from connection, sign-in and server failures', async () => {
  answer(async () =>
    Response.json({ data: { appCode: 'reading.below_latest' }, message: 'Retake or dispute' }, { status: 409 }),
  );
  await expect(captureReading(input)).rejects.toMatchObject({
    name: 'UploadRefusedError',
    data: { appCode: 'reading.below_latest' },
    message: 'Retake or dispute',
  });
  for (const status of [401, 408, 429, 500]) {
    answer(async () => new Response(null, { status }));
    await expect(captureReading(input)).rejects.toThrow(CAPTURE_FAILED);
  }
  answer(async () => {
    throw new TypeError('Network request failed');
  });
  await expect(captureReading(input)).rejects.toThrow(CAPTURE_FAILED);
});
