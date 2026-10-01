import { expect, test, vi } from 'vitest';

vi.mock('@/lib/api-base-url', () => ({ apiBaseUrl: 'https://api.jedidiah.test' }));
vi.mock('@/lib/auth', () => ({ sessionCookieHeader: async () => 'better-auth.session_token=secret' }));
vi.mock('./reading-photo-part', () => ({
  readingPhotoPart: async () => new Blob(['meter'], { type: 'image/jpeg' }),
}));

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
const delivered = {
  id: input.localId,
  machineId: input.machineId,
  role: 'spot',
  value: 12.3,
  capturedAt: '2026-09-08T08:00:00.000Z',
  disputed: false,
  photo: { storageKey: 'k', contentType: 'image/jpeg', byteSize: 5, updatedAt: '2026-09-08T08:00:01.000Z' },
  aiVerification: 'disagrees',
  aiValue: 123,
};

test('sends the fields and photo with the session cookie and returns the stored reading without AI results', async () => {
  const result = await captureReading(input, 'file:///camera/meter.jpg', async (url, init) => {
    expect(url).toBe('https://api.jedidiah.test/api/contracting/readings');
    expect(new Headers(init.headers).get('Cookie')).toBe('better-auth.session_token=secret');
    const body = init.body as FormData;
    expect(body.get('localId')).toBe(input.localId);
    expect(body.get('value')).toBe('12.3');
    expect(body.get('expectedPreviousId')).toBe(input.expectedPreviousId);
    expect(body.get('comment')).toBe('Glass cracked, digits hard to read');
    expect(await (body.get('photo') as Blob).text()).toBe('meter');
    return Response.json(delivered, { status: 201 });
  });
  expect(result).toEqual({
    id: input.localId,
    machineId: input.machineId,
    role: 'spot',
    value: 12.3,
    capturedAt: '2026-09-08T08:00:00.000Z',
    disputed: false,
    photoBacked: true,
  });

  await captureReading({ ...input, comment: '', expectedPreviousId: undefined }, null, async (_url, init) => {
    const body = init.body as FormData;
    expect(body.has('comment')).toBe(false);
    expect(body.has('expectedPreviousId')).toBe(false);
    expect(body.has('photo')).toBe(false);
    return Response.json({ ...delivered, photo: null }, { status: 201 });
  });
});

test('separates the server’s refusals from connection, sign-in and server failures', async () => {
  await expect(
    captureReading(input, null, async () =>
      Response.json({ data: { appCode: 'reading.below_latest' }, message: 'Retake or dispute' }, { status: 409 }),
    ),
  ).rejects.toMatchObject({ name: 'ReadingRefusedError', code: 'reading.below_latest', message: 'Retake or dispute' });
  for (const status of [401, 408, 429, 500])
    await expect(captureReading(input, null, async () => new Response(null, { status }))).rejects.toThrow(
      CAPTURE_FAILED,
    );
  await expect(
    captureReading(input, null, async () => {
      throw new TypeError('Network request failed');
    }),
  ).rejects.toThrow(CAPTURE_FAILED);
});

test('sends an arrival’s stint overrides as multipart JSON', async () => {
  const stintOverrides = { implementId: null, driverUserId: 'driver-1' };
  await captureReading(
    {
      ...input,
      role: 'arrival',
      assignmentId: '5f1c2d3e-0001-4a00-8000-000000000002',
      stintOverrides,
      expectedPreviousId: null,
    },
    null,
    async (_url, init) => {
      expect(JSON.parse(String((init.body as FormData).get('stintOverrides')))).toEqual(stintOverrides);
      return Response.json({ ...delivered, role: 'arrival', photo: null }, { status: 201 });
    },
  );
});
