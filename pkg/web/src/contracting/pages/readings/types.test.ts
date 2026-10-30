import { readAtFromInput } from '@pkg/domain/contracting';
import { DateIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import { DisputeResolveValues, disputeResolveDefaults, toReadingAmendInput } from './types.js';

// Read Ats carry seconds the picker cannot show.
const dispute = {
  readings: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      value: 2906.7,
      capturedAt: DateIso.parse('2026-10-27T13:00:42.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      value: 2914.1,
      capturedAt: DateIso.parse('2026-10-27T13:02:10.000Z'),
    },
  ],
};

describe('toReadingAmendInput', () => {
  it('posts every reading, keeping an untouched Read At to the second and a corrected one from the picker', () => {
    const defaults = disputeResolveDefaults(dispute);
    const [arrival, departure] = defaults.readings as [
      (typeof defaults.readings)[number],
      (typeof defaults.readings)[number],
    ];
    const values = DisputeResolveValues.parse({
      readings: [arrival, { ...departure, value: 2914.2, readAt: '2026-10-26T18:30' }],
      reason: ' Captured a day late ',
    });
    expect(toReadingAmendInput(values, dispute)).toEqual({
      amendments: [
        { id: arrival.id, value: 2906.7, capturedAt: '2026-10-27T13:00:42.000Z' },
        { id: departure.id, value: 2914.2, capturedAt: readAtFromInput('2026-10-26T18:30')?.toISOString() },
      ],
      reason: 'Captured a day late',
    });
  });

  it('refuses a blank reason and a missing Read At', () => {
    const defaults = disputeResolveDefaults(dispute);
    expect(DisputeResolveValues.safeParse(defaults).success).toBe(false);
    const [first, ...rest] = defaults.readings;
    expect(
      DisputeResolveValues.safeParse({ readings: [{ ...first, readAt: '' }, ...rest], reason: 'Late' }).success,
    ).toBe(false);
  });
});
