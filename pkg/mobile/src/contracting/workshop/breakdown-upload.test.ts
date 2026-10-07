import { beforeEach, describe, expect, test, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authed-fetch', () => ({ authedFetch: fetchMock }));
vi.mock('@/lib/observability', () => ({ addBreadcrumb: vi.fn() }));
vi.mock('@/lib/file-part', () => ({
  filePart: async (uri: string) => new Blob([uri], { type: 'image/jpeg' }),
}));

import { UploadRefusedError } from '@/lib/multipart-upload';
import { reportBreakdown } from './breakdown-upload';

const machineId = '0b7a4c84-7f0b-4b8e-9d55-0d6b8a0f0c11';
const input = {
  subject: { kind: 'machine' as const, id: machineId },
  urgency: 'code-red' as const,
  description: 'Hose burst',
  latitude: -25.7,
  longitude: 28.2,
};

describe('reportBreakdown', () => {
  beforeEach(() => fetchMock.mockReset());

  test('sends the fields and one photo part per photo', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(reportBreakdown(input, ['file:///a.jpg', 'file:///b.jpg'])).rejects.toThrow();
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get('subject')).toBe(JSON.stringify(input.subject));
    expect(body.get('latitude')).toBe('-25.7');
    expect(body.getAll('photo')).toHaveLength(2);
  });

  test('turns a refusal into the server’s sentence and code', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        message: 'A Breakdown keeps at most 6 photos.',
        data: { appCode: 'breakdown.too_many_photos' },
      }),
    });
    const refusal = await reportBreakdown(input, []).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(UploadRefusedError);
    expect(refusal).toMatchObject({
      data: { appCode: 'breakdown.too_many_photos' },
      message: 'A Breakdown keeps at most 6 photos.',
    });
  });
});
