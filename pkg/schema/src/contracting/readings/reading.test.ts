import { describe, expect, it } from 'vitest';
import { ReadingCaptureInput, readingRefusalOf } from './reading.js';

const capture = {
  localId: '78108c3d-4b34-44f1-bf87-4fcb00a6a233',
  machineId: '5f1c2d3e-0001-4a00-8000-000000000001',
  value: 123.4,
  capturedAt: '2026-09-07T08:00:00Z',
};

describe('ReadingCaptureInput', () => {
  it('captures a spot reading only: an arrival or departure from an old phone is refused, not stored as spot', () => {
    expect(ReadingCaptureInput.safeParse(capture).success).toBe(true);
    expect(ReadingCaptureInput.safeParse({ ...capture, role: 'arrival' }).success).toBe(false);
  });
});

describe('readingRefusalOf', () => {
  const readingId = '00000000-0000-4000-8000-000000000001';

  it('reads the refused reading', () => {
    expect(readingRefusalOf({ appCode: 'reading.invalid_amendment', readingId })).toMatchObject({ readingId });
  });

  it('keeps every key it can read when one it cannot is beside them, and reads nothing from anything else', () => {
    const refusal = readingRefusalOf({ readingId, suggestedReadAt: { readAt: 'not a time' } });
    expect(refusal.readingId).toBe(readingId);
    expect(refusal.suggestedReadAt).toBeUndefined();
    expect(readingRefusalOf(undefined)).toEqual({});
    expect(readingRefusalOf('refused')).toEqual({});
  });
});
