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
  it('reads the proposed Read At, and nothing from anything it cannot read', () => {
    expect(readingRefusalOf({ appCode: 'reading.below_latest', suggestedReadAt: { kind: 'now' } })).toEqual({
      suggestedReadAt: { kind: 'now' },
    });
    expect(readingRefusalOf({ suggestedReadAt: { readAt: 'not a time' } })).toEqual({});
    expect(readingRefusalOf(undefined)).toEqual({});
    expect(readingRefusalOf('refused')).toEqual({});
  });
});
