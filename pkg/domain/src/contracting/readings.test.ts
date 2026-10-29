import { describe, expect, it } from 'vitest';
import {
  type AmendableReading,
  amendmentSettledFinding,
  contradictingTelematics,
  type ReadingAttentionFacts,
  readingAttention,
  readingAttentionKinds,
  readingEvidenceCaption,
  readingEvidenceState,
  readingExceptionTypes,
  readingNeedsALook,
  readingNeedsALookLevel,
  readingPhotoPath,
  readingsContradictedBy,
  readingVerification,
  resolveReadingAmendment,
  type SequencedReading,
  shownReadingAttention,
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

describe('readingEvidenceState', () => {
  const base = { photoBacked: true, aiValue: 412.3, aiVerification: 'agrees' as const };
  it.each([
    [{ photoBacked: false, aiVerification: 'not-applicable' }, { state: 'no-photo' }],
    [{ aiVerification: 'pending', aiValue: null, aiConfidence: null }, { state: 'pending' }],
    [{ aiVerification: 'low-confidence', aiValue: null, aiConfidence: 0.88 }, { state: 'unreadable' }],
    [
      { aiVerification: 'low-confidence', aiConfidence: 0.5 },
      { state: 'low-confidence', aiValue: 412.3 },
    ],
    [{ aiVerification: 'disagrees' }, { state: 'disagrees', aiValue: 412.3 }],
    [{ aiVerification: 'agrees' }, { state: 'agrees', aiValue: 412.3 }],
  ] as const)('classifies the evidence state: %j', (overrides, expected) => {
    expect(readingEvidenceState({ ...base, ...overrides })).toEqual(expected);
  });
});

describe('readingEvidenceCaption', () => {
  it('names John Deere for a telematics row and never stamps it as missing a photo', () => {
    expect(readingEvidenceCaption({ telematicsProvider: 'john-deere', photoBacked: false })).toBe('John Deere');
    expect(readingEvidenceCaption({ telematicsProvider: null, photoBacked: true })).toBe('Photo-backed');
    expect(readingEvidenceCaption({ telematicsProvider: null, photoBacked: false })).toBe('Missing Photo Evidence');
  });
});

describe('contradictingTelematics', () => {
  const at = (hour: number) => new Date(`2026-06-03T${String(hour).padStart(2, '0')}:00:00Z`);
  const ledger = (
    id: string,
    sequence: number,
    hour: number,
    value: number,
    telematicsProvider: SequencedReading['telematicsProvider'] = null,
  ) => ({ id, sequence, capturedAt: at(hour), value, telematicsProvider }) satisfies SequencedReading;
  const deere = ledger('deere', 2, 9, 1000, 'john-deere');

  it('finds the report a captured reading sits out of sequence with, on either side', () => {
    expect(contradictingTelematics([ledger('early', 1, 6, 1010), deere], 'early')).toEqual(deere);
    expect(contradictingTelematics([deere, ledger('late', 3, 12, 990)], 'late')).toEqual(deere);
  });

  it('is silent for a reading in sequence and for a Telematics Reading itself', () => {
    const readings = [ledger('early', 1, 6, 990), deere, ledger('late', 3, 12, 1010)];
    expect(contradictingTelematics(readings, 'early')).toBeNull();
    expect(contradictingTelematics(readings, 'late')).toBeNull();
    expect(contradictingTelematics(readings, 'deere')).toBeNull();
  });

  it('breaks a Read At tie by acceptance order', () => {
    expect(contradictingTelematics([ledger('same', 1, 9, 1010), deere], 'same')).toEqual(deere);
    expect(contradictingTelematics([deere, ledger('same', 3, 9, 1010)], 'same')).toBeNull();
  });

  it('lists the captured readings a report leaves out of sequence, in ledger order, by the same rule', () => {
    const readings = [ledger('late', 4, 12, 990), ledger('early', 1, 6, 1010), deere, ledger('fine', 3, 10, 1005)];
    expect(readingsContradictedBy(readings, 'deere').map((reading) => reading.id)).toEqual(['early', 'late']);
    expect(readingsContradictedBy(readings, 'early')).toEqual([]);
    expect(readingsContradictedBy(readings, 'missing')).toEqual([]);
  });
});

describe('resolveReadingAmendment', () => {
  // A captured reading John Deere contradicted is disputed on its own, with no pair.
  const contradicted = (): AmendableReading[] => [
    clean('r0', 100),
    { ...clean('r1', 90), disputed: true, disputeReason: 'John Deere reported 100.0 h at 3 Jun 2026, 14:05.' },
    clean('r2', 120),
    { ...clean('r3', 80), disputed: true, disputeReason: 'John Deere reported 130.0 h at 4 Jun 2026, 14:05.' },
  ];

  it('settles a reading John Deere contradicted only when its value is back in sequence', () => {
    expect(resolveReadingAmendment(contradicted(), { id: 'r1', value: 90 })).toEqual({
      ok: false,
      reason: 'out_of_range',
    });
    expect(resolveReadingAmendment(contradicted(), { id: 'r1', value: 110 })).toEqual({
      ok: true,
      changes: [{ id: 'r1', disputed: false, disputeReason: null, disputedPreviousId: null }],
    });
  });

  it('keeps every other contradicted reading disputed when a different reading is amended', () => {
    const readings = [...contradicted(), clean('r4', 140)];
    expect(resolveReadingAmendment(readings, { id: 'r4', value: 150 })).toEqual({
      ok: true,
      changes: [{ id: 'r4', disputed: false, disputeReason: null, disputedPreviousId: null }],
    });
  });

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

describe('an amended reading', () => {
  const amended = { amendedAt: '2026-09-07T09:00:00.000Z', evidenceReviewedAt: '2026-09-07T09:00:00.000Z' };

  it('shows only what still needs a look once amended', () => {
    const attention = ['ai-pending', 'missing-photo', 'disputed'] as const;
    expect(shownReadingAttention({ amendedAt: null, attention })).toEqual(attention);
    expect(shownReadingAttention({ ...amended, attention })).toEqual(['disputed']);
  });

  it('settles the AI finding until a re-verify reopens it', () => {
    expect(amendmentSettledFinding(amended)).toBe(true);
    expect(amendmentSettledFinding({ ...amended, evidenceReviewedAt: null })).toBe(false);
    expect(amendmentSettledFinding({ amendedAt: null, evidenceReviewedAt: amended.evidenceReviewedAt })).toBe(false);
  });
});
