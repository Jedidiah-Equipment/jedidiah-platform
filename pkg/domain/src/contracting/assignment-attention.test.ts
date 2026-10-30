import { describe, expect, it } from 'vitest';
import { assignmentAttentionSentence, jobNeedsALookCount, stintAttentionKinds } from './assignment-attention.js';

const thresholds = { travelFlagThresholdHours: 4, johnDeereDifferenceThresholdHours: 10 };
const at = '2026-10-28T12:05:00Z';
const stint = {
  travelHours: 2,
  travelClamped: false,
  travelSet: false,
  arrival: { hours: 4480, telematics: null },
  departure: null,
};

describe('assignment attention', () => {
  it('needs a look for Travel over the threshold, Travel clamped, or Job hours far from John Deere', () => {
    expect(stintAttentionKinds(stint, thresholds)).toEqual([]);
    expect(stintAttentionKinds({ ...stint, travelHours: 6 }, thresholds)).toEqual(['travel-over-threshold']);
    expect(stintAttentionKinds({ ...stint, travelHours: 0, travelClamped: true }, thresholds)).toEqual([
      'travel-clamped',
    ]);
    const farFromDeere = { ...stint, arrival: { hours: 4480, telematics: { hours: 4512, at } } };
    expect(stintAttentionKinds(farFromDeere, thresholds)).toEqual(['john-deere-difference']);
    expect(assignmentAttentionSentence('john-deere-difference', farFromDeere, thresholds)).toBe(
      'John Deere differs by 32.0 h',
    );
    expect(assignmentAttentionSentence('travel-over-threshold', { ...stint, travelHours: 6 }, thresholds)).toBe(
      'Travel 6.0 h is over the 4.0 h threshold',
    );
  });

  it('clears both Travel kinds once management sets Travel by hand', () => {
    expect(stintAttentionKinds({ ...stint, travelHours: 6, travelSet: true }, thresholds)).toEqual([]);
  });

  it('never warns within the John Deere threshold, nor for an unlinked Machine', () => {
    const near = { ...stint, departure: { hours: 4520, telematics: { hours: 4512, at } } };
    expect(stintAttentionKinds(near, thresholds)).toEqual([]);
  });

  it('counts the stints needing a look, not their kinds', () => {
    expect(
      jobNeedsALookCount([
        { attention: ['travel-clamped', 'john-deere-difference'] },
        { attention: [] },
        { attention: ['travel-over-threshold'] },
      ]),
    ).toBe(2);
  });
});
