import { describe, expect, it } from 'vitest';
import { ReadingCaptureInput, ReadingCaptureMultipart, readingCaptureMultipartFields } from './reading.js';

const capture = {
  localId: '78108c3d-4b34-44f1-bf87-4fcb00a6a233',
  machineId: '5f1c2d3e-0001-4a00-8000-000000000001',
  role: 'spot' as const,
  value: 123.4,
  capturedAt: '2026-09-07T08:00:00Z',
  disputePrevious: true,
};

describe('reading capture multipart', () => {
  it('round-trips a capture through its string fields', () => {
    const fields = Object.fromEntries(
      readingCaptureMultipartFields({ ...capture, expectedPreviousId: null, comment: 'Glass cracked' }),
    );
    expect(fields).toMatchObject({ value: '123.4', disputePrevious: 'true', expectedPreviousId: '' });
    expect(ReadingCaptureMultipart.parse(fields)).toEqual({
      ...capture,
      expectedPreviousId: null,
      comment: 'Glass cracked',
    });
  });

  it('omits undefined fields and reads a blank comment as none', () => {
    const fields = Object.fromEntries(readingCaptureMultipartFields(capture));
    expect(fields).not.toHaveProperty('expectedPreviousId');
    expect(ReadingCaptureMultipart.parse({ ...fields, comment: '' })).toEqual({ ...capture, comment: null });
  });

  it('rejects fields the capture does not declare', () => {
    expect(() =>
      ReadingCaptureMultipart.parse({ ...Object.fromEntries(readingCaptureMultipartFields(capture)), extra: 'x' }),
    ).toThrow();
  });

  it('binds arrival and departure to a Machine Assignment and forbids that link on other roles', () => {
    const assignmentId = '5f1c2d3e-0001-4a00-8000-000000000002';
    expect(ReadingCaptureInput.safeParse({ ...capture, role: 'arrival' }).success).toBe(false);
    expect(ReadingCaptureInput.safeParse({ ...capture, role: 'arrival', assignmentId }).success).toBe(true);
    expect(ReadingCaptureInput.safeParse({ ...capture, assignmentId }).success).toBe(false);
    const fields = Object.fromEntries(
      readingCaptureMultipartFields({ ...capture, role: 'departure', assignmentId, comment: 'Photo unavailable' }),
    );
    expect(ReadingCaptureMultipart.parse(fields)).toMatchObject({ role: 'departure', assignmentId });
  });
});
