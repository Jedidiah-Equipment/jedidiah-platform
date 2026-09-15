import { describe, expect, it } from 'vitest';
import { type AmendableReading, resolveReadingAmendment } from './readings.js';

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
