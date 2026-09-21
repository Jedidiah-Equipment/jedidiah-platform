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
  it('shows a verified photo and confidence', () => {
    expect(readingEvidence(base)).toMatchObject({
      evidenceLabel: 'Photo-backed · AI-verified',
      confidenceLabel: '97% confidence in extracted value',
      resultLabel: '412.3 h',
      tone: 'ok',
    });
  });

  it('identifies a manual capture and an unreadable meter', () => {
    expect(
      readingEvidence({
        ...base,
        photoBacked: false,
        aiValue: null,
        aiConfidence: null,
        aiVerification: 'not-applicable',
      }),
    ).toMatchObject({
      evidenceLabel: 'Missing Photo Evidence',
      resultLabel: 'No photo verification',
      tone: 'muted',
    });
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
