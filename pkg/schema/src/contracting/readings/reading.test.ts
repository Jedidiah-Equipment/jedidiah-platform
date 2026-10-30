import { describe, expect, it } from 'vitest';
import { ReadingCaptureInput, readingRefusalOf } from './reading.js';

const capture = {
  localId: '78108c3d-4b34-44f1-bf87-4fcb00a6a233',
  machineId: '5f1c2d3e-0001-4a00-8000-000000000001',
  role: 'spot' as const,
  value: 123.4,
  capturedAt: '2026-09-07T08:00:00Z',
  disputePrevious: true,
};

describe('ReadingCaptureInput', () => {
  it('binds arrival and departure to a Machine Assignment and forbids that link on other roles', () => {
    const assignmentId = '5f1c2d3e-0001-4a00-8000-000000000002';
    expect(ReadingCaptureInput.safeParse({ ...capture, role: 'arrival' }).success).toBe(false);
    expect(ReadingCaptureInput.safeParse({ ...capture, role: 'arrival', assignmentId }).success).toBe(true);
    expect(ReadingCaptureInput.safeParse({ ...capture, assignmentId }).success).toBe(false);
  });

  it('lets only an arrival change its stint', () => {
    const assignmentId = '5f1c2d3e-0001-4a00-8000-000000000002';

    expect(
      ReadingCaptureInput.safeParse({ ...capture, role: 'arrival', assignmentId, stintOverrides: {} }).success,
    ).toBe(true);
    expect(
      ReadingCaptureInput.safeParse({ ...capture, role: 'departure', assignmentId, stintOverrides: {} }).success,
    ).toBe(false);
    expect(ReadingCaptureInput.safeParse({ ...capture, stintOverrides: {} }).success).toBe(false);
  });
});

describe('readingRefusalOf', () => {
  const readingId = '00000000-0000-4000-8000-000000000001';

  it('reads the refused Job Action, the proposal and the refused reading', () => {
    expect(
      readingRefusalOf({
        appCode: 'reading.forbidden',
        refused: { action: 'capture', reason: 'not-your-job' },
        readingId,
      }),
    ).toMatchObject({ refused: { action: 'capture', reason: 'not-your-job' }, readingId });
  });

  it('keeps every key it can read when one it cannot is beside them, and reads nothing from anything else', () => {
    const refusal = readingRefusalOf({ readingId, suggestedReadAt: { readAt: 'not a time' } });
    expect(refusal.readingId).toBe(readingId);
    expect(refusal.suggestedReadAt).toBeUndefined();
    expect(readingRefusalOf(undefined)).toEqual({});
    expect(readingRefusalOf('refused')).toEqual({});
  });
});
