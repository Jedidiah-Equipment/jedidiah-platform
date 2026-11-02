import type { DateIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import {
  assignmentAttentionSentence,
  jobNeedsALookCount,
  rearmedAttentionKinds,
  stintAttention,
  stintAttentionKinds,
} from './assignment-attention.js';

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

  it('moves a dismissed kind out of needs a look, and forgets a dismissal whose kind no longer holds', () => {
    const henk = { dismissedAt: at as DateIso, dismissedByName: 'Henk Botha' };
    const both = { ...stint, travelHours: 6, arrival: { hours: 4480, telematics: { hours: 4512, at } } };
    expect(stintAttention(both, thresholds, [{ kind: 'john-deere-difference', ...henk }])).toEqual({
      attention: ['travel-over-threshold'],
      dismissedAttention: [{ kind: 'john-deere-difference', ...henk }],
    });
    expect(stintAttention(stint, thresholds, [{ kind: 'travel-over-threshold', ...henk }])).toEqual({
      attention: [],
      dismissedAttention: [],
    });
  });

  it('re-arms a dismissal only when a fact its kind reads changes', () => {
    const row = {
      arrivalHours: 4480,
      departureHours: 4500,
      arrivalTelematicsHours: 4512,
      departureTelematicsHours: null,
      travelHours: 6,
      travelClamped: false,
    };
    expect(rearmedAttentionKinds(row, { ...row })).toEqual([]);
    // A new departure is a new comparison with John Deere; Travel is untouched.
    expect(rearmedAttentionKinds(row, { ...row, departureHours: 4510 })).toEqual(['john-deere-difference']);
    expect(rearmedAttentionKinds(row, { ...row, travelHours: 7 })).toEqual(['travel-over-threshold']);
    // A moved arrival is a new comparison and, while Travel is clamped, a new reason for the clamp.
    expect(rearmedAttentionKinds(row, { ...row, arrivalHours: 4470, travelClamped: true })).toEqual([
      'travel-clamped',
      'john-deere-difference',
    ]);
  });
});
