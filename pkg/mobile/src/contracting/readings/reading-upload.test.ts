import { expect, test } from 'vitest';
import { uploadReading } from './reading-upload';

const item = {
  localId: 'capture-1',
  machineId: 'machine-1',
  role: 'spot' as const,
  value: 12.3,
  capturedAt: '2026-09-08T08:00:00Z',
  disputePrevious: false,
  photoLocalUri: 'file:///meter.jpg',
};
test('uploads the original fields and photo together, without interpreting the AI result', async () => {
  const photo = new Blob(['meter'], { type: 'image/jpeg' });
  await uploadReading(
    item,
    async (body) => {
      expect(body.get('localId')).toBe('capture-1');
      expect(body.get('value')).toBe('12.3');
      expect(body.get('disputePrevious')).toBe('false');
      expect(await (body.get('photo') as Blob).text()).toBe('meter');
      return Response.json({ aiVerification: 'disagrees' }, { status: 201 });
    },
    photo,
  );
});
test('separates a below-latest refusal from transient upload and authentication failures', async () => {
  await expect(
    uploadReading(item, async () =>
      Response.json({ data: { appCode: 'reading.below_latest' }, message: 'Retake or dispute' }, { status: 409 }),
    ),
  ).rejects.toMatchObject({ code: 'reading.below_latest' });
  for (const status of [401, 403, 408, 429, 500]) {
    await expect(uploadReading(item, async () => new Response(null, { status }))).rejects.not.toHaveProperty('code');
  }
});
