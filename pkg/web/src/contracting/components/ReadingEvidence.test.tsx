import { describe, expect, it } from 'vitest';
import { readingAssessment, readingEvidence, readingEvidenceState } from './ReadingEvidence.js';

const base = {
  photoBacked: true,
  value: 120.4,
  aiValue: 412.3,
  aiConfidence: 0.974,
  aiVerification: 'agrees' as const,
};

describe('reading evidence', () => {
  it.each([
    ['agrees', 'Photo-backed · AI-verified', '412.3 h'],
    ['pending', 'Photo-backed · Verification pending', 'Verification pending'],
    ['disagrees', 'Photo-backed · Extracted value differs', '412.3 h'],
    ['low-confidence', 'Photo-backed · Low extraction confidence', '412.3 h'],
  ] as const)('labels a photo-backed %s reading', (aiVerification, evidenceLabel, resultLabel) => {
    expect(readingEvidence({ ...base, aiVerification })).toMatchObject({
      evidenceLabel,
      resultLabel,
      confidenceLabel: '97% confidence in extracted value',
    });
  });

  it.each(['agrees', 'pending', 'disagrees', 'low-confidence', 'not-applicable'] as const)(
    'identifies a photo-less %s reading',
    (aiVerification) => {
      expect(readingEvidence({ ...base, photoBacked: false, aiVerification })).toMatchObject({
        evidenceLabel: 'Missing Photo Evidence',
        resultLabel: 'No photo verification',
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
    });
  });

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

  it.each([
    {
      overrides: { photoBacked: false, aiVerification: 'not-applicable', aiValue: null, aiConfidence: null },
      tone: 'notice',
      badge: 'No AI result',
      title: 'No photo to analyse',
      description: 'The recorded reading has no meter photo, so AI cannot check its value.',
      result: 'No analysis',
      confidenceCaption: 'No photo to assess',
    },
    {
      overrides: { aiVerification: 'pending', aiValue: null, aiConfidence: null },
      tone: 'notice',
      badge: 'Checking photo',
      title: 'Photo analysis pending',
      description: 'The captured photo is available, but AI has not returned a result yet.',
      result: 'Waiting for result',
      confidenceCaption: 'Waiting for AI',
    },
    {
      overrides: { aiVerification: 'low-confidence', aiValue: null, aiConfidence: 0.88 },
      tone: 'warning',
      badge: 'Cannot verify from photo',
      title: 'No readable meter found',
      description: 'AI could not find a readable hour meter in the photo. This does not confirm the recorded 120.4 h.',
      result: 'No readable meter',
      confidenceCaption: 'Confidence that no readable meter is visible',
    },
    {
      overrides: { aiVerification: 'low-confidence', aiConfidence: 0.5 },
      tone: 'warning',
      badge: 'Uncertain result',
      title: 'Possible reading, not reliable',
      description: 'AI tentatively read 412.3 h. The image is too unclear to verify the recorded 120.4 h.',
      result: 'Possibly 412.3 h',
      confidenceCaption: 'Confidence in the extracted value',
    },
    {
      overrides: { aiVerification: 'disagrees' },
      tone: 'warning',
      badge: 'Different value found',
      title: 'AI reading differs',
      description: 'AI read 412.3 h from the photo; the recorded reading is 120.4 h. Review the photo before amending.',
      result: '412.3 h',
      confidenceCaption: 'Confidence in the extracted value',
    },
    {
      overrides: { aiVerification: 'agrees' },
      tone: 'success',
      badge: 'Same value found',
      title: 'AI reading matches',
      description: 'AI read 412.3 h from the photo, matching the recorded reading.',
      result: '412.3 h',
      confidenceCaption: 'Confidence in the extracted value',
    },
  ] as const)('words the reading dialog per state: $badge', ({ overrides, ...expected }) => {
    expect(readingAssessment({ ...base, ...overrides })).toEqual(expected);
  });
});
