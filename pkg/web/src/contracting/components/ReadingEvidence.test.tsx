import { describe, expect, it } from 'vitest';
import { readingEvidence } from './ReadingEvidence.js';

const base = {
  photoBacked: true,
  aiValue: 412.3,
  aiConfidence: 0.974,
  aiVerification: 'agrees' as const,
  disputed: false,
  disputeReason: null,
  aiHint: null,
};

describe('reading evidence', () => {
  it.each([
    ['agrees', 'Photo-backed · AI-verified', '412.3 h', 'ok'],
    ['pending', 'Photo-backed · Verification pending', 'Verification pending', 'warn'],
    ['disagrees', 'Photo-backed · Extracted value differs', '412.3 h', 'warn'],
    ['low-confidence', 'Photo-backed · Low extraction confidence', '412.3 h', 'warn'],
    ['not-applicable', 'Photo-backed · Photo verification not applicable', 'No photo verification', 'ok'],
  ] as const)('labels a photo-backed %s reading', (aiVerification, evidenceLabel, resultLabel, tone) => {
    expect(readingEvidence({ ...base, aiVerification })).toMatchObject({
      evidenceLabel,
      resultLabel,
      confidenceLabel: '97% confidence in extracted value',
      tone,
    });
  });

  it.each(['agrees', 'pending', 'disagrees', 'low-confidence', 'not-applicable'] as const)(
    'identifies a photo-less %s reading',
    (aiVerification) => {
      expect(readingEvidence({ ...base, photoBacked: false, aiVerification })).toMatchObject({
        evidenceLabel: 'Missing Photo Evidence',
        tone: 'muted',
      });
    },
  );

  it('preserves the unreadable-meter confidence result', () => {
    expect(
      readingEvidence({ ...base, aiValue: null, aiConfidence: 0.88, aiVerification: 'low-confidence' }),
    ).toMatchObject({
      evidenceLabel: 'Photo-backed',
      resultLabel: 'No readable meter detected',
      resultConfidencePercent: 88,
      tone: 'warn',
    });
  });
});
