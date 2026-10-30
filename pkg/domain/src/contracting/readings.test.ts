import { describe, expect, it } from 'vitest';
import { formatDate } from '../formatting/date.js';
import { resolveReadingAmendments } from './amendments.js';
import { readingSourceLabel, type SequencedReading } from './readings.js';

const day = (date: number, hour = 8, minute = 0) => new Date(Date.UTC(2026, 9, date, hour, minute));
const NOW = day(29, 12);
const reading = (
  id: string,
  capturedAt: Date,
  value: number,
  overrides: Partial<SequencedReading> = {},
): SequencedReading => ({
  id,
  sequence: capturedAt.getTime() / 60_000,
  capturedAt,
  value,
  telematicsProvider: null,
  ...overrides,
});
const amend = (target: SequencedReading, change: { value?: number; capturedAt?: Date } = {}) => ({
  id: target.id,
  value: change.value ?? target.value,
  capturedAt: change.capturedAt ?? target.capturedAt,
});
const resolve = (readings: SequencedReading[], amendments: ReturnType<typeof amend>[]) =>
  resolveReadingAmendments(readings, amendments, NOW);

describe('readingSourceLabel', () => {
  it('names John Deere for a Telematics Reading, else the capturer by first name', () => {
    expect(readingSourceLabel({ telematicsProvider: 'john-deere', capturedByName: null })).toBe('John Deere');
    expect(readingSourceLabel({ telematicsProvider: null, capturedByName: 'Sipho Dlamini' })).toBe('Sipho');
  });
});

describe('resolveReadingAmendments', () => {
  const ledger = () => [reading('r0', day(1), 100), reading('r1', day(2), 1200), reading('r2', day(3), 121)];
  const [, wrong, last] = ledger() as [SequencedReading, SequencedReading, SequencedReading];

  it('accepts a value back between its neighbours', () => {
    expect(resolve(ledger(), [amend(wrong, { value: 110 })])).toEqual({ ok: true });
  });

  it('refuses unknown readings, amendments that move nothing, and values outside the neighbours', () => {
    expect(resolve(ledger(), [{ ...amend(wrong), id: 'missing' }])).toMatchObject({ ok: false, reason: 'not_found' });
    expect(resolve(ledger(), [amend(last)])).toEqual({
      ok: false,
      reason: 'nothing_to_amend',
      id: 'r2',
      message: 'Nothing to amend.',
    });
    for (const value of [99, 122])
      expect(resolve(ledger(), [amend(wrong, { value })])).toEqual({
        ok: false,
        reason: 'out_of_range',
        id: 'r1',
        message: 'Amended hours must be between the neighbouring readings.',
      });
  });

  it('is refused below a Telematics Reading before its new Read At, naming John Deere as capture does', () => {
    const readings = [
      reading('moved', day(25, 8), 95),
      reading('report', day(26, 8), 100, { telematicsProvider: 'john-deere' }),
    ];
    expect(resolve(readings, [amend(readings[0] as SequencedReading, { capturedAt: day(28, 8) })])).toEqual({
      ok: false,
      reason: 'contradicts_telematics',
      id: 'moved',
      message: `John Deere reported 100.0 h at ${formatDate(day(26, 8), 'medium')}. Check the time or the value.`,
    });
  });

  it('is refused when its engine hours outrun the clock against a neighbour', () => {
    const before = reading('before', day(27, 16, 17), 1232.8);
    const after = reading('after', day(28, 9), 1258.2);
    expect(resolve([before, after], [amend(after, { capturedAt: day(27, 16, 19) })])).toEqual({
      ok: false,
      reason: 'outruns_clock',
      id: 'after',
      message: `25.4 h of engine time cannot pass in 0.0 h of clock time since the reading of 1 232.8 h at ${formatDate(day(27, 16, 17), 'medium')}.`,
    });
  });

  it('is refused in the future', () => {
    expect(resolve(ledger(), [amend(last, { capturedAt: new Date(NOW.getTime() + 1) })])).toMatchObject({
      ok: false,
      reason: 'future_read_at',
      message: 'Read At cannot be in the future.',
    });
  });
});
