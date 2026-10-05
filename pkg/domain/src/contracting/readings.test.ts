import { describe, expect, it } from 'vitest';
import {
  type AmendableReading,
  awaitsAiVerdict,
  type ReadingAttentionFacts,
  readingAttention,
  readingAttentionKinds,
  readingExceptionTypes,
  readingNeedsALook,
  readingNeedsALookLevel,
  readingPhotoPath,
  readingVerification,
  resolveReadingAmendment,
} from './readings.js';

const clean = (id: string, value: number): AmendableReading => ({
  id,
  value,
  disputed: false,
  disputeReason: null,
  disputedPreviousId: null,
});
const disputedPair = (): AmendableReading[] => [
  clean('r0', 100),
  { ...clean('r1', 1200), disputed: true, disputeReason: 'The next capture disputes this reading.' },
  { ...clean('r2', 121), disputed: true, disputeReason: 'The previous reading is wrong.', disputedPreviousId: 'r1' },
  clean('r3', 130),
];

describe('resolveReadingAmendment', () => {
  it('refuses unknown readings and values outside the neighbouring readings', () => {
    expect(resolveReadingAmendment(disputedPair(), { id: 'missing', value: 1 })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(resolveReadingAmendment(disputedPair(), { id: 'r1', value: 99 })).toEqual({
      ok: false,
      reason: 'out_of_range',
    });
    expect(resolveReadingAmendment(disputedPair(), { id: 'r1', value: 122 })).toEqual({
      ok: false,
      reason: 'out_of_range',
    });
  });

  it('settles the pair when the amended reading brings the disputing reading back into order', () => {
    expect(resolveReadingAmendment(disputedPair(), { id: 'r1', value: 120 })).toEqual({
      ok: true,
      changes: [
        { id: 'r1', disputed: false, disputeReason: null, disputedPreviousId: null },
        { id: 'r2', disputed: false, disputeReason: null, disputedPreviousId: null },
      ],
    });
  });

  it('keeps a pair the amendment did not touch and still reports the amended reading', () => {
    const readings = [...disputedPair(), clean('r4', 140)];
    expect(resolveReadingAmendment(readings, { id: 'r4', value: 135 })).toEqual({
      ok: true,
      changes: [{ id: 'r4', disputed: false, disputeReason: null, disputedPreviousId: null }],
    });
  });

  it('keeps the pair when the amended value leaves the disputing reading below', () => {
    const result = resolveReadingAmendment(disputedPair(), { id: 'r2', value: 121 });
    expect(result).toEqual({
      ok: true,
      changes: [
        {
          id: 'r2',
          disputed: true,
          disputeReason: 'The previous reading is wrong.',
          disputedPreviousId: 'r1',
        },
      ],
    });
  });
});

describe('readingPhotoPath', () => {
  it('addresses a reading photo by its encoded id', () => {
    expect(readingPhotoPath('a/b')).toBe('/api/contracting/readings/a%2Fb/photo');
  });
});

describe('readingVerification', () => {
  it('is pending until the AI returns a confidence', () => {
    expect(readingVerification(120, null, null)).toBe('pending');
    expect(readingVerification(120, 120, null)).toBe('pending');
  });

  it('is low-confidence below the threshold or without a value', () => {
    expect(readingVerification(120, 120, 0.79)).toBe('low-confidence');
    expect(readingVerification(120, null, 0.95)).toBe('low-confidence');
  });

  it('compares to one decimal at or above the threshold', () => {
    expect(readingVerification(120.04, 120, 0.8)).toBe('agrees');
    expect(readingVerification(120.1, 120, 0.8)).toBe('disagrees');
  });
});

describe('readingAttention', () => {
  const facts = (overrides: Partial<ReadingAttentionFacts>): ReadingAttentionFacts => ({
    disputed: false,
    aiVerification: 'agrees',
    evidenceReviewedAt: null,
    ...overrides,
  });

  it('flags a disputed reading whatever its evidence', () => {
    const reading = facts({ disputed: true, evidenceReviewedAt: '2026-09-01T08:00:00.000Z' });
    expect(readingAttention(reading)).toEqual({ disputed: true, aiFlagged: null });
    expect(readingNeedsALook(reading)).toBe(true);
  });

  it.each(['disagrees', 'low-confidence'] as const)('flags an unreviewed %s reading as a warning', (aiVerification) => {
    const reading = facts({ aiVerification });
    expect(readingAttention(reading)).toEqual({ disputed: false, aiFlagged: aiVerification });
    expect(readingNeedsALookLevel(reading)).toBe('warning');
    expect(readingExceptionTypes(reading)).toEqual(['ai-flagged']);
  });

  it('keeps a pending verification as a notice that needs no look', () => {
    const reading = facts({ aiVerification: 'pending' });
    expect(readingAttentionKinds({ ...reading, photoBacked: false })).toEqual(['ai-pending', 'missing-photo']);
    expect(readingNeedsALook(reading)).toBe(false);
    expect(readingExceptionTypes(reading)).toEqual([]);
  });

  it('puts a disputed reading at critical, above its AI warning', () => {
    const reading = facts({ disputed: true, aiVerification: 'disagrees' });
    expect(readingNeedsALookLevel(reading)).toBe('critical');
    expect(readingExceptionTypes(reading)).toEqual(['disputed', 'ai-flagged']);
  });

  it('stops flagging once the evidence is reviewed', () => {
    for (const evidenceReviewedAt of ['2026-09-01T08:00:00.000Z', new Date('2026-09-01T08:00:00.000Z')]) {
      const reading = facts({ aiVerification: 'disagrees', evidenceReviewedAt });
      expect(readingAttention(reading)).toEqual({ disputed: false, aiFlagged: null });
      expect(readingNeedsALook(reading)).toBe(false);
    }
  });

  it.each(['agrees', 'not-applicable'] as const)('does not flag %s', (aiVerification) => {
    const reading = facts({ aiVerification });
    expect(readingAttention(reading)).toEqual({ disputed: false, aiFlagged: null });
    expect(readingNeedsALook(reading)).toBe(false);
  });
});

describe('awaitsAiVerdict', () => {
  it('is true while any reading on screen is still pending its AI check', () => {
    expect(awaitsAiVerdict([null, { aiVerification: 'agrees' }, { aiVerification: 'pending' }])).toBe(true);
    expect(awaitsAiVerdict([undefined, { aiVerification: 'not-applicable' }])).toBe(false);
    expect(awaitsAiVerdict([])).toBe(false);
  });
});
