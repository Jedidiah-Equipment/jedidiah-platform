import { readAtFromInput } from '@pkg/domain/contracting';
import { DateIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import { DisputeResolveValues, disputeResolveDefaults, toReadingAmendInput, unpostableReason } from './types.js';

// Read Ats carry seconds the picker cannot show.
const reading = (id: number, value: number, capturedAt: string, disputedPreviousId: string | null = null) => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  value,
  capturedAt: DateIso.parse(capturedAt),
  disputed: true,
  disputedPreviousId,
});
// The production pair: a departure, and the next arrival saying the previous reading is wrong.
const departure = reading(1, 4728.4, '2026-10-25T13:00:42.000Z');
const arrival = reading(2, 4499.7, '2026-10-27T13:02:10.000Z', departure.id);
const pair = { readings: [departure, arrival] };
// The other production shape: an arrival and departure John Deere contradicted, each on its own.
const contradicted = {
  readings: [reading(3, 2906.7, '2026-10-27T13:00:42.000Z'), reading(4, 2914.1, '2026-10-27T13:02:10.000Z')],
};
const correcting = (
  dispute: Parameters<typeof disputeResolveDefaults>[0],
  index: number,
  change: Partial<{ value: number; readAt: string }>,
) => {
  const defaults = disputeResolveDefaults(dispute);
  return DisputeResolveValues.parse({
    readings: defaults.readings.map((values, at) => (at === index ? { ...values, ...change } : values)),
    reason: ' Captured late ',
  });
};

describe('toReadingAmendInput', () => {
  it('posts only the corrected reading of a pair, so the Job its partner bounds is left alone', () => {
    expect(toReadingAmendInput(correcting(pair, 1, { readAt: '2026-10-20T07:30' }), pair)).toEqual({
      amendments: [{ id: arrival.id, value: 4499.7, capturedAt: readAtFromInput('2026-10-20T07:30')?.toISOString() }],
      reason: 'Captured late',
    });
  });

  it('always posts a reading John Deere contradicted on its own, keeping an untouched Read At to the second', () => {
    const [first, second] = contradicted.readings as [(typeof contradicted.readings)[number], typeof departure];
    expect(toReadingAmendInput(correcting(contradicted, 1, { value: 2914.2 }), contradicted).amendments).toEqual([
      { id: first.id, value: 2906.7, capturedAt: '2026-10-27T13:00:42.000Z' },
      { id: second.id, value: 2914.2, capturedAt: '2026-10-27T13:02:10.000Z' },
    ]);
  });

  it('refuses a blank reason and a missing Read At', () => {
    const defaults = disputeResolveDefaults(pair);
    expect(DisputeResolveValues.safeParse(defaults).success).toBe(false);
    const [first, ...rest] = defaults.readings;
    expect(
      DisputeResolveValues.safeParse({ readings: [{ ...first, readAt: '' }, ...rest], reason: 'Late' }).success,
    ).toBe(false);
  });
});

describe('unpostableReason', () => {
  it('waits for a correction, and caps one Resolve at what one amend carries', () => {
    expect(unpostableReason(correcting(pair, 0, {}), pair)).toBe(
      'Correct the hours or Read At of a reading to resolve the Dispute.',
    );
    expect(unpostableReason(correcting(pair, 0, { value: 4400 }), pair)).toBeNull();
    const long = {
      readings: Array.from({ length: 9 }, (_, index) => reading(index, 100 + index, '2026-10-27T13:00:42.000Z')),
    };
    expect(unpostableReason(correcting(long, 0, {}), long)).toBe('Correct at most 8 readings in one Resolve.');
  });
});
