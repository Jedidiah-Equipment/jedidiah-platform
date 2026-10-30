import { readAtFromInput } from '@pkg/domain/contracting';
import { describe, expect, it } from 'vitest';
import { ReadingCorrection, recordedCorrection, toAmendment } from './types.js';

// Read At carries seconds the picker cannot show.
const recorded = { id: '00000000-0000-4000-8000-000000000001', value: 120.4, capturedAt: '2026-10-27T13:00:42.000Z' };

describe('a reading correction', () => {
  it('starts as recorded and posts an untouched Read At to the second', () => {
    const correction = recordedCorrection(recorded);
    expect(correction.value).toBe(120.4);
    expect(toAmendment({ id: recorded.id, ...correction }, recorded)).toEqual({
      id: recorded.id,
      value: 120.4,
      capturedAt: recorded.capturedAt,
    });
  });

  it('posts a re-picked Read At at the picked minute', () => {
    expect(toAmendment({ id: recorded.id, value: 121, readAt: '2026-10-26T07:30' }, recorded)).toEqual({
      id: recorded.id,
      value: 121,
      capturedAt: readAtFromInput('2026-10-26T07:30')?.toISOString(),
    });
  });

  it('refuses a blank or future Read At', () => {
    expect(ReadingCorrection.safeParse({ value: 1, readAt: '' }).success).toBe(false);
    expect(ReadingCorrection.safeParse({ value: 1, readAt: '2999-01-01T00:00' }).success).toBe(false);
  });
});
