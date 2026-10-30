import { describe, expect, it } from 'vitest';
import { formatDate } from '../formatting/date.js';
import { type AmendableReading, amendmentEffects, amendmentJobs, resolveReadingAmendments } from './amendments.js';
import {
  contradictingTelematics,
  type DisputeMember,
  disputedReadingReason,
  disputeGroupReason,
  groupDisputes,
  NEXT_CAPTURE_DISPUTES,
  PREVIOUS_READING_WRONG,
  readingSourceLabel,
  readingsContradictedBy,
  type SequencedReading,
} from './readings.js';

const day = (date: number, hour = 8, minute = 0) => new Date(Date.UTC(2026, 9, date, hour, minute));
const NOW = day(29, 12);
const reading = (
  id: string,
  capturedAt: Date,
  value: number,
  overrides: Partial<AmendableReading> = {},
): AmendableReading => ({
  id,
  sequence: capturedAt.getTime() / 60_000,
  capturedAt,
  value,
  role: 'spot',
  telematicsProvider: null,
  disputed: false,
  disputeReason: null,
  disputedPreviousId: null,
  ...overrides,
});
const clean = (id: string, value: number) => reading(id, day(Number(id.slice(1)) + 1), value);
const settled = (id: string) => ({ id, disputed: false, disputeReason: null, disputedPreviousId: null });
const amend = (target: AmendableReading, change: { value?: number; capturedAt?: Date } = {}) => ({
  id: target.id,
  value: change.value ?? target.value,
  capturedAt: change.capturedAt ?? target.capturedAt,
});
const resolve = (
  readings: AmendableReading[],
  amendments: ReturnType<typeof amend>[],
  stints: Parameters<typeof resolveReadingAmendments>[2] = [],
) => resolveReadingAmendments(readings, amendments, stints, NOW);
const disputedPair = (): AmendableReading[] => [
  clean('r0', 100),
  { ...clean('r1', 1200), disputed: true, disputeReason: 'The next capture disputes this reading.' },
  { ...clean('r2', 121), disputed: true, disputeReason: 'The previous reading is wrong.', disputedPreviousId: 'r1' },
  clean('r3', 130),
];

describe('readingSourceLabel', () => {
  it('names John Deere for a Telematics Reading, else the capturer by first name', () => {
    expect(readingSourceLabel({ telematicsProvider: 'john-deere', capturedByName: null })).toBe('John Deere');
    expect(readingSourceLabel({ telematicsProvider: null, capturedByName: 'Sipho Dlamini' })).toBe('Sipho');
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
    expect(contradictingTelematics([ledger('early', 1, 6, 1010), deere], ['early'])).toEqual(deere);
    expect(contradictingTelematics([deere, ledger('late', 3, 12, 990)], ['late'])).toEqual(deere);
  });

  it('is silent for a reading in sequence and for a Telematics Reading itself', () => {
    const readings = [ledger('early', 1, 6, 990), deere, ledger('late', 3, 12, 1010)];
    expect(contradictingTelematics(readings, ['early'])).toBeNull();
    expect(contradictingTelematics(readings, ['late'])).toBeNull();
    expect(contradictingTelematics(readings, ['deere'])).toBeNull();
  });

  it('breaks a Read At tie by acceptance order', () => {
    expect(contradictingTelematics([ledger('same', 1, 9, 1010), deere], ['same'])).toEqual(deere);
    expect(contradictingTelematics([deere, ledger('same', 3, 9, 1010)], ['same'])).toBeNull();
  });

  it('gives a Dispute the report nearest to any of its readings that it contradicts', () => {
    const near = ledger('near', 4, 11, 1000, 'john-deere');
    const fine = ledger('fine', 3, 10, 1000);
    const late = ledger('late', 5, 12, 990);
    expect(contradictingTelematics([deere, fine, near, late], ['fine', 'late'])).toEqual(near);
    expect(contradictingTelematics([deere, fine, near], ['fine'])).toBeNull();
  });

  it('lists the captured readings a report leaves out of sequence, in ledger order, by the same rule', () => {
    const readings = [ledger('late', 4, 12, 990), ledger('early', 1, 6, 1010), deere, ledger('fine', 3, 10, 1005)];
    expect(readingsContradictedBy(readings, 'deere').map((reading) => reading.id)).toEqual(['early', 'late']);
    expect(readingsContradictedBy(readings, 'early')).toEqual([]);
    expect(readingsContradictedBy(readings, 'missing')).toEqual([]);
  });
});

describe('resolveReadingAmendments', () => {
  // A captured reading John Deere contradicted is disputed on its own, with no pair.
  const contradicted = (): AmendableReading[] => [
    clean('r0', 100),
    { ...clean('r1', 90), disputed: true, disputeReason: 'John Deere reported 100.0 h at 3 Jun 2026, 14:05.' },
    clean('r2', 120),
    { ...clean('r3', 80), disputed: true, disputeReason: 'John Deere reported 130.0 h at 4 Jun 2026, 14:05.' },
    clean('r4', 90),
  ];
  const [, r1, , , r4] = contradicted() as [
    AmendableReading,
    AmendableReading,
    AmendableReading,
    AmendableReading,
    AmendableReading,
  ];

  it('settles a reading John Deere contradicted only when its value is back in sequence', () => {
    expect(resolve(contradicted(), [amend(r1)])).toMatchObject({ ok: false, reason: 'out_of_range', id: 'r1' });
    expect(resolve(contradicted(), [amend(r1, { value: 110 })])).toEqual({ ok: true, changes: [settled('r1')] });
  });

  it('keeps every other contradicted reading disputed when a different reading is amended', () => {
    expect(resolve(contradicted(), [amend(r4, { value: 91 })])).toEqual({ ok: true, changes: [settled('r4')] });
  });

  it('refuses unknown readings and values outside the neighbouring readings', () => {
    const [, wrong] = disputedPair() as [AmendableReading, AmendableReading];
    expect(resolve(disputedPair(), [{ ...amend(wrong), id: 'missing' }])).toMatchObject({
      ok: false,
      reason: 'not_found',
      id: 'missing',
    });
    for (const value of [99, 122])
      expect(resolve(disputedPair(), [amend(wrong, { value })])).toEqual({
        ok: false,
        reason: 'out_of_range',
        id: 'r1',
        message: 'Amended hours must be between the neighbouring readings.',
      });
  });

  it('settles the pair when the amended reading brings the disputing reading back into order', () => {
    const [, wrong] = disputedPair() as [AmendableReading, AmendableReading];
    expect(resolve(disputedPair(), [amend(wrong, { value: 120 })])).toEqual({
      ok: true,
      changes: [settled('r1'), settled('r2')],
    });
  });

  it('keeps a pair the amendment did not touch and still reports the amended reading', () => {
    const readings = [...disputedPair(), clean('r4', 140)];
    expect(resolve(readings, [amend(readings[4] as AmendableReading, { value: 135 })])).toEqual({
      ok: true,
      changes: [settled('r4')],
    });
  });

  it('refuses an amendment that changes neither the hours nor the Read At of a reading in a pair', () => {
    const disputing = disputedPair()[2] as AmendableReading;
    expect(resolve(disputedPair(), [amend(disputing)])).toEqual({
      ok: false,
      reason: 'nothing_to_amend',
      id: 'r2',
      message: 'Nothing to amend.',
    });
  });

  it('settles a pair whose order flips once the disputing reading is re-dated before the one it disputed', () => {
    const readings = [
      clean('r0', 110),
      { ...clean('r1', 125), disputed: true, disputeReason: 'The next capture disputes this reading.' },
      {
        ...clean('r2', 121),
        disputed: true,
        disputeReason: 'The previous reading is wrong.',
        disputedPreviousId: 'r1',
      },
    ];
    expect(resolve(readings, [amend(readings[2] as AmendableReading, { capturedAt: day(1, 20) })])).toEqual({
      ok: true,
      changes: [settled('r1'), settled('r2')],
    });
  });

  describe('a re-dated reading', () => {
    // The production case: an arrival and departure saved on 27 Oct at 15:00 with Read At "now", flagged by
    // John Deere's 2 927.2 h at 10:09 that morning.
    const deere = reading('deere', day(27, 10, 9), 2927.2, { telematicsProvider: 'john-deere' });
    const flagged = { disputed: true, disputeReason: 'John Deere reported 2 927.2 h at 27 Oct 2026, 12:09.' };
    const ledger = () => [
      reading('before', day(24, 17), 2900, { role: 'departure' }),
      deere,
      reading('arrival', day(27, 15), 2906.7, { role: 'arrival', ...flagged }),
      reading('departure', day(27, 15, 1), 2914.1, { role: 'departure', ...flagged }),
    ];
    const [, , arrival, departure] = ledger() as [
      AmendableReading,
      AmendableReading,
      AmendableReading,
      AmendableReading,
    ];
    const stints = [
      { assignmentId: 'earlier', arrivalId: 'first', departureId: 'before' },
      { assignmentId: 'stint', arrivalId: 'arrival', departureId: 'departure' },
    ];

    it('settles both readings of a stint moved before the report in one call', () => {
      expect(
        resolve(
          ledger(),
          [amend(arrival, { capturedAt: day(26, 8) }), amend(departure, { capturedAt: day(26, 16) })],
          stints,
        ),
      ).toEqual({ ok: true, changes: [settled('arrival'), settled('departure')] });
    });

    it('settles a departure moved behind the report it contradicted', () => {
      const readings = [
        ...ledger().slice(0, 2),
        { ...arrival, disputed: false, disputeReason: null, capturedAt: day(26, 8) },
        departure,
      ];
      expect(resolve(readings, [amend(departure, { capturedAt: day(26, 16) })], stints)).toEqual({
        ok: true,
        changes: [settled('departure')],
      });
    });

    it('is refused below its new previous reading, naming John Deere as capture does', () => {
      const arrived = [
        ...ledger().slice(0, 2),
        { ...arrival, disputed: false, disputeReason: null, capturedAt: day(26, 8) },
        departure,
      ];
      expect(resolve(arrived, [amend(departure, { capturedAt: day(27, 12) })], stints)).toEqual({
        ok: false,
        reason: 'contradicts_telematics',
        id: 'departure',
        message: `John Deere reported 2 927.2 h at ${formatDate(day(27, 10, 9), 'medium')}. Check the time or the value.`,
      });
    });

    it('is refused when its engine hours outrun the clock against a neighbour', () => {
      const arrived = reading('arrival', day(27, 16, 17), 1232.8, { role: 'arrival' });
      const departed = reading('departure', day(28, 9), 1258.2, { role: 'departure' });
      expect(resolve([arrived, departed], [amend(departed, { capturedAt: day(27, 16, 19) })])).toEqual({
        ok: false,
        reason: 'outruns_clock',
        id: 'departure',
        message: `25.4 h of engine time cannot pass in 0.0 h of clock time since the arrival reading of 1 232.8 h at ${formatDate(day(27, 16, 17), 'medium')}.`,
      });
    });

    it('is refused where it would contradict a Telematics Reading a disputed reading hides', () => {
      const hidden = [
        reading('moved', day(25, 8), 95),
        reading('report', day(26, 8), 100, { telematicsProvider: 'john-deere' }),
        reading('lower', day(27, 8), 90, { disputed: true, disputeReason: 'John Deere reported 100.0 h.' }),
      ];
      expect(resolve(hidden, [amend(hidden[0] as AmendableReading, { capturedAt: day(28, 8) })])).toEqual({
        ok: false,
        reason: 'contradicts_telematics',
        id: 'moved',
        message: `John Deere reported 100.0 h at ${formatDate(day(26, 8), 'medium')}. Check the time or the value.`,
      });
    });

    it('is refused against an earlier report a lower later one does not hide', () => {
      const fallen = [
        reading('high', day(1, 9), 1200, { telematicsProvider: 'john-deere' }),
        reading('low', day(1, 10), 1150, { telematicsProvider: 'john-deere' }),
        reading('captured', day(5), 1100, { disputed: true, disputeReason: 'John Deere reported 1 200.0 h.' }),
      ];
      expect(resolve(fallen, [amend(fallen[2] as AmendableReading, { value: 1150 })])).toEqual({
        ok: false,
        reason: 'contradicts_telematics',
        id: 'captured',
        message: `John Deere reported 1 200.0 h at ${formatDate(day(1, 9), 'medium')}. Check the time or the value.`,
      });
      expect(resolve(fallen, [amend(fallen[2] as AmendableReading, { value: 1200 })])).toMatchObject({ ok: true });
    });

    it('is refused in the future', () => {
      expect(resolve(ledger(), [amend(departure, { capturedAt: new Date(NOW.getTime() + 1) })])).toMatchObject({
        ok: false,
        reason: 'future_read_at',
        message: 'Read At cannot be in the future.',
      });
    });

    it('keeps stints in time order', () => {
      // A departure before its own arrival, at the same hours an idle machine reads.
      const idle = [
        reading('arrival', day(26, 8), 2906.7, { role: 'arrival' }),
        reading('departure', day(26, 16), 2906.7, { role: 'departure' }),
      ];
      expect(resolve(idle, [amend(idle[1] as AmendableReading, { capturedAt: day(26, 7) })], stints)).toMatchObject({
        ok: false,
        reason: 'out_of_order',
        id: 'departure',
      });
      // An arrival before the Machine's previous departure.
      const earlier = [
        reading('first', day(23, 8), 2895, { role: 'arrival' }),
        reading('before', day(24, 17), 2900, { role: 'departure' }),
        reading('arrival', day(26, 8), 2900, { role: 'arrival' }),
      ];
      expect(resolve(earlier, [amend(earlier[2] as AmendableReading, { capturedAt: day(24, 16) })], stints)).toEqual({
        ok: false,
        reason: 'out_of_order',
        id: 'arrival',
        message:
          "Stints stay in time order: an arrival after the Machine's previous departure, a departure after its own arrival and before the next arrival.",
      });
    });

    // Capture's pair: judgeCapture's arrives-before-departure row with a lower next reading (capture.test.ts).
    it('judges stint order before placement, as capture does (AMD-05)', () => {
      const earlier = [
        reading('first', day(23, 8), 2895, { role: 'arrival' }),
        reading('before', day(24, 17), 2900, { role: 'departure' }),
        reading('arrival', day(26, 8), 2906, { role: 'arrival' }),
      ];
      expect(resolve(earlier, [amend(earlier[2] as AmendableReading, { capturedAt: day(24, 16) })], stints)).toEqual({
        ok: false,
        reason: 'out_of_order',
        id: 'arrival',
        message:
          "Stints stay in time order: an arrival after the Machine's previous departure, a departure after its own arrival and before the next arrival.",
      });
    });
  });
});

describe('groupDisputes', () => {
  const member = (
    id: string,
    capturedAt: Date,
    overrides: Partial<DisputeMember & { disputeReason: string | null }> = {},
  ) => ({
    id,
    sequence: capturedAt.getTime() / 60_000,
    capturedAt,
    value: 100,
    telematicsProvider: null,
    disputed: true,
    disputedPreviousId: null,
    assignmentId: null,
    disputeReason: null,
    ...overrides,
  });
  const ids = (groups: { id: string }[][]) => groups.map((group) => group.map((reading) => reading.id));

  it('joins a pair by the reading it disputes', () => {
    const readings = [member('later', day(2), { disputedPreviousId: 'earlier' }), member('earlier', day(1))];
    expect(ids(groupDisputes(readings))).toEqual([['earlier', 'later']]);
  });

  it('joins two readings of one stint flagged by the same report', () => {
    const readings = [
      member('arrival', day(1), { assignmentId: 's1' }),
      member('departure', day(2), { assignmentId: 's1' }),
    ];
    expect(ids(groupDisputes(readings))).toEqual([['arrival', 'departure']]);
  });

  it('keeps two unrelated stints apart, newest first by their first reading, ledger order inside', () => {
    const readings = [
      member('a1', day(1), { assignmentId: 's1' }),
      member('b2', day(5), { assignmentId: 's2' }),
      member('a2', day(2), { assignmentId: 's1' }),
      member('b1', day(4), { assignmentId: 's2' }),
    ];
    expect(ids(groupDisputes(readings))).toEqual([
      ['b1', 'b2'],
      ['a1', 'a2'],
    ]);
  });

  it('makes one group of a pair across two stints plus a reading sharing a stint with one of them', () => {
    const readings = [
      member('departure', day(2), { assignmentId: 's1' }),
      member('arrival', day(3), { assignmentId: 's2', disputedPreviousId: 'departure' }),
      member('first-arrival', day(1), { assignmentId: 's1' }),
    ];
    expect(ids(groupDisputes(readings))).toEqual([['first-arrival', 'departure', 'arrival']]);
  });

  it('leaves out readings that are not Disputed, and a pair whose other half settled', () => {
    const readings = [
      member('settled', day(1), { disputed: false }),
      member('alone', day(2), { disputedPreviousId: 'settled' }),
    ];
    expect(ids(groupDisputes(readings))).toEqual([['alone']]);
  });

  it('reads a Dispute’s reason off its shape: the report it contradicts, then the pair, then its one reading', () => {
    const report = { ...member('report', day(1)), telematicsProvider: 'john-deere' as const, value: 2927.2 };
    const flagged = 'John Deere reported 2 927.2 h at 27 Oct 2026, 10:09.';
    const pair = [member('earlier', day(1)), member('later', day(2), { disputedPreviousId: 'earlier' })] as const;
    expect(disputeGroupReason(pair, report)).toBe(`John Deere reported 2 927.2 h at ${formatDate(day(1), 'medium')}.`);
    expect(disputeGroupReason(pair, null)).toBe(PREVIOUS_READING_WRONG);
    expect(disputeGroupReason([member('alone', day(1), { disputeReason: flagged })], null)).toBe(flagged);
    expect(disputeGroupReason([member('target', day(1))], null)).toBe(NEXT_CAPTURE_DISPUTES);
    expect(disputedReadingReason({ disputeReason: null, disputedPreviousId: 'earlier' })).toBe(PREVIOUS_READING_WRONG);
  });
});

describe('amendmentEffects', () => {
  it('tells a move from a settle of a reading John Deere contradicted, and from an unchanged reading', () => {
    const readings = [
      clean('r0', 100),
      { ...clean('r1', 90), disputed: true, disputeReason: 'John Deere reported 100.0 h.' },
      ...disputedPair().slice(1, 3),
    ];
    const [, contradicted, wrong, disputing] = readings as AmendableReading[] as [
      AmendableReading,
      AmendableReading,
      AmendableReading,
      AmendableReading,
    ];
    const effects = amendmentEffects(readings, [
      amend(contradicted),
      amend(wrong, { value: 120 }),
      { ...amend(disputing), capturedAt: disputing.capturedAt.toISOString() },
    ]);
    expect(Object.fromEntries(effects)).toEqual({ r1: 'settles', [wrong.id]: 'moves', [disputing.id]: 'unchanged' });
  });
});

describe('amendmentJobs', () => {
  const stints = [
    { assignmentId: 'a', jobId: 'job-a', arrivalId: 'arrival-a', departureId: 'departure-a' },
    { assignmentId: 'b', jobId: 'job-b', arrivalId: 'arrival-b', departureId: null },
    { assignmentId: 'c', jobId: 'job-c', arrivalId: 'arrival-c', departureId: null },
  ];
  const ledger = [
    reading('arrival-a', day(1), 100, { role: 'arrival' }),
    reading('departure-a', day(2), 110, { role: 'departure' }),
    reading('arrival-b', day(3), 112, { role: 'arrival' }),
    reading('arrival-c', day(5), 120, { role: 'arrival' }),
  ];
  const [, departure] = ledger as [AmendableReading, AmendableReading];

  it('moves the Job a moved departure bounds and the next stint’s, before and after it is re-dated', () => {
    expect(amendmentJobs(ledger, [amend(departure, { capturedAt: day(4) })], stints)).toEqual({
      bound: new Set(['job-a', 'job-b', 'job-c']),
      moved: new Set(['job-a', 'job-b', 'job-c']),
    });
  });

  it('gates the Job an acknowledgement bounds without moving any', () => {
    expect(amendmentJobs(ledger, [amend(departure)], stints)).toEqual({
      bound: new Set(['job-a']),
      moved: new Set(),
    });
  });
});
