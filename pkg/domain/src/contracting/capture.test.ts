import { describe, expect, test } from 'vitest';
import { formatDate } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import {
  CAPTURE_STEPS_START,
  type CaptureAttempt,
  type CaptureDraft,
  type CaptureFormWorld,
  type CaptureNeighbour,
  type CaptureRule,
  type CaptureWorld,
  captureRefusals,
  captureStepsReducer,
  confirmCaptureDate,
  deriveCaptureForm,
  type EstimateFacts,
  type EstimateNeighbour,
  estimateReadAt,
  estimateSentence,
  judgeCapture,
  proposesReadAt,
} from './capture.js';
import { FUTURE_READ_AT_TOLERANCE_MS, isFutureReadAt } from './read-at.js';

const now = new Date('2026-10-09T08:00:00Z');
const anHourAgo = new Date('2026-10-09T07:00:00Z');
const aDayAgo = new Date('2026-10-08T08:00:00Z');
const reading = (
  id: string,
  value: number,
  capturedAt: Date,
  telematicsProvider: CaptureNeighbour['telematicsProvider'] = null,
): CaptureNeighbour => ({ id, value, capturedAt, telematicsProvider });

const world = (overrides: Partial<CaptureWorld> = {}): CaptureWorld => ({
  latest: { id: 'latest', value: 100 },
  previous: reading('latest', 100, aDayAgo),
  next: null,
  previousTelematics: null,
  nextTelematics: null,
  machineRetired: false,
  now,
  futureToleranceMs: 0,
  ...overrides,
});

const capture = (overrides: Partial<CaptureAttempt> = {}): CaptureAttempt => ({
  value: 120,
  readAt: now,
  ...overrides,
});

describe('judgeCapture', () => {
  test.each<[CaptureRule, Partial<CaptureWorld>, Partial<CaptureAttempt>]>([
    ['future-read-at', {}, { readAt: new Date('2026-10-09T08:00:01Z') }],
    ['retired-machine', { machineRetired: true }, {}],
    ['below-latest', {}, { value: 90 }],
  ])('refuses %s', (rule, given, attempt) => {
    expect(judgeCapture(world(given), capture(attempt))).toMatchObject({ ok: false, rule });
  });

  test.each<[string, Partial<CaptureWorld>, Partial<CaptureAttempt>]>([
    ['an idle Machine reading its latest value', {}, { value: 100 }],
    ['the first reading of an empty ledger', { latest: null, previous: null }, { value: 3 }],
    [
      'a Read At within the server’s tolerance',
      { futureToleranceMs: FUTURE_READ_AT_TOLERANCE_MS },
      { readAt: new Date('2026-10-09T08:04:00Z') },
    ],
  ])('accepts %s', (_name, given, attempt) => {
    expect(judgeCapture(world(given), capture(attempt))).toEqual({ ok: true });
  });

  describe('against its time neighbours', () => {
    const yesterday = (hour: number) => new Date(`2026-10-08T${String(hour).padStart(2, '0')}:00:00Z`);
    const before = reading('yesterday', 999, yesterday(15));
    const today = reading('today', 1001, new Date('2026-10-09T06:00:00Z'));
    const between = world({ latest: { id: 'today', value: 1001 }, previous: before, next: today });
    const backdated = (value: number) => capture({ value, readAt: yesterday(16) });

    test('lands a day-late reading behind today’s, and accepts a value equal to either neighbour', () => {
      for (const value of [1000.5, 999, 1001]) expect(judgeCapture(between, backdated(value))).toEqual({ ok: true });
    });

    test('refuses a value above the next reading, naming it', () => {
      expect(judgeCapture(between, backdated(1002))).toEqual({
        ok: false,
        rule: 'above-next',
        reason: 'reading.above_next',
        message: `A later reading of ${formatHours(1001)} at ${formatDate(today.capturedAt, 'medium')} is lower. Check the time or the value.`,
      });
    });

    test('refuses a backdated value below its previous, naming it', () => {
      expect(judgeCapture(between, backdated(998))).toEqual({
        ok: false,
        rule: 'below-previous',
        reason: 'reading.below_latest',
        message: `A reading of ${formatHours(999)} at ${formatDate(before.capturedAt, 'medium')} is higher. Check the time or the value.`,
      });
    });

    test('names John Deere when the neighbour is a Telematics Reading', () => {
      const reported = reading('deere', 1000, anHourAgo, 'john-deere');
      expect(
        judgeCapture(
          world({ latest: { id: 'deere', value: 1000 }, previous: reported, previousTelematics: reported }),
          capture({ value: 990 }),
        ),
      ).toEqual({
        ok: false,
        rule: 'below-previous',
        reason: 'reading.below_latest',
        message: `John Deere reported ${formatHours(1000)} at ${formatDate(anHourAgo, 'medium')}. Check the time or the value.`,
      });
      const telematics = reading('deere-later', 1010, now, 'john-deere');
      expect(
        judgeCapture(
          world({
            latest: { id: 'deere-later', value: 1010 },
            previous: reported,
            next: telematics,
            previousTelematics: reported,
            nextTelematics: telematics,
          }),
          capture({ value: 1020, readAt: new Date('2026-10-09T07:30:00Z') }),
        ),
      ).toMatchObject({
        rule: 'above-next',
        message: `John Deere reported ${formatHours(1010)} at ${formatDate(now, 'medium')}. Check the time or the value.`,
      });
    });
  });

  test('answers to the nearest Telematics Reading even past a captured reading in between', () => {
    const reported = reading('deere', 1200, new Date('2026-10-09T07:00:00Z'), 'john-deere');
    const human = reading('human', 1100, new Date('2026-10-09T07:30:00Z'));
    expect(
      judgeCapture(
        world({ latest: { id: 'human', value: 1100 }, previous: human, previousTelematics: reported }),
        capture({ value: 1150 }),
      ),
    ).toMatchObject({ ok: false, rule: 'below-previous', reason: 'reading.below_latest' });
  });

  describe('the meter cannot outrun the clock', () => {
    const previous = reading('previous', 1232.8, new Date('2026-10-27T14:17:00Z'));
    const recent = world({
      latest: { id: 'previous', value: 1232.8 },
      previous,
      now: new Date('2026-10-27T14:19:00Z'),
    });
    const attempt = (value: number, readAt = new Date('2026-10-27T14:19:00Z')) => capture({ value, readAt });

    test('refuses engine hours since the previous reading that the clock never allowed, naming it', () => {
      expect(judgeCapture(recent, attempt(1258.2))).toEqual({
        ok: false,
        rule: 'outruns-clock',
        reason: 'reading.outruns_clock',
        message: `${formatHours(25.4)} of engine time cannot pass in ${formatHours(0)} of clock time since the reading of ${formatHours(1232.8)} at ${formatDate(previous.capturedAt, 'medium')}. Check Read At on this reading, or amend that reading's Read At.`,
      });
    });

    test('refuses a backdated value the next reading could not have reached in time', () => {
      const next = reading('next', 1010, now);
      expect(
        judgeCapture(
          world({ previous: null, next, latest: { id: 'next', value: 1010 } }),
          capture({ value: 1000, readAt: anHourAgo }),
        ),
      ).toMatchObject({ rule: 'outruns-clock', message: expect.stringContaining('clock time before the reading') });
    });

    test('allows an hour of slack', () => {
      expect(judgeCapture(recent, attempt(1233.7, previous.capturedAt))).toMatchObject({ ok: true });
    });
  });

  test('proposes a Read At for the two below refusals, and only those', () => {
    const human = reading('human', 1020, new Date('2026-10-08T12:00:00Z'));
    const belowPrevious = world({
      latest: { id: 'today', value: 1030 },
      previous: human,
      next: reading('today', 1030, now),
    });
    const belowLatest = world({ latest: { id: 'human', value: 1020 }, previous: human });
    const attempt = capture({ value: 1005, readAt: new Date('2026-10-08T12:30:00Z') });
    for (const [given, rule] of [
      [belowPrevious, 'below-previous'],
      [belowLatest, 'below-latest'],
    ] as const) {
      const verdict = judgeCapture(given, attempt);
      expect(verdict).toMatchObject({ rule });
      expect(!verdict.ok && proposesReadAt(verdict.rule)).toBe(true);
    }
    for (const rule of ['above-next', 'outruns-clock', 'future-read-at', 'retired-machine'] as const)
      expect(proposesReadAt(rule)).toBe(false);
  });

  test('judges in the stated order', () => {
    expect(
      judgeCapture(world({ machineRetired: true }), capture({ readAt: new Date('2026-10-09T09:00:00Z') })),
    ).toMatchObject({ rule: 'future-read-at' });
    expect(judgeCapture(world({ machineRetired: true }), capture({ value: 90 }))).toMatchObject({
      rule: 'retired-machine',
    });
  });
});

describe('captureRefusals', () => {
  test('pairs every rule with its wire code and sentence', () => {
    expect(captureRefusals).toEqual({
      'future-read-at': { code: 'reading.future_read_at', message: 'Read At cannot be in the future.' },
      'retired-machine': { code: 'reading.retired_machine', message: 'Cannot capture readings for a retired Machine.' },
      'below-latest': { code: 'reading.below_latest', message: 'Reading is below the latest reading.' },
    });
  });
});

describe('estimateReadAt', () => {
  const at = (time: string) => new Date(`2026-10-08T${time}:00Z`);
  const later = new Date('2026-10-08T20:00:00Z');
  const neighbour = (
    id: string,
    value: number,
    time: string,
    telematicsProvider: CaptureNeighbour['telematicsProvider'] = null,
  ): EstimateNeighbour => ({ ...reading(id, value, at(time), telematicsProvider), createdAt: at(time) });
  const deereFloor = neighbour('deere-floor', 1000, '10:00', 'john-deere');
  const deereCeiling = neighbour('deere-ceiling', 1010, '11:00', 'john-deere');
  const facts = (overrides: Partial<EstimateFacts> = {}): EstimateFacts => ({
    latest: reading('latest', 1020, at('12:00'), 'john-deere'),
    floor: deereFloor,
    ceiling: deereCeiling,
    now: later,
    ...overrides,
  });

  test('has nothing to go on with an empty ledger', () => {
    expect(estimateReadAt(1005, facts({ latest: null }))).toEqual({ kind: 'none' });
  });

  test('is now at or above the latest, and impossible when the meter cannot have got there yet', () => {
    expect(estimateReadAt(1020, facts())).toEqual({ kind: 'now' });
    expect(estimateReadAt(1028, facts())).toEqual({ kind: 'now' });
    const latest = reading('latest', 1232.8, now);
    expect(estimateReadAt(1258.2, facts({ latest, now: new Date(now.getTime() + 2 * 60_000) }))).toEqual({
      kind: 'impossible',
      sentence: `The meter cannot have reached ${formatHours(1258.2)} yet: ${formatHours(25.4)} since ${formatHours(1232.8)} at ${formatDate(now, 'medium')}. Check the hours.`,
    });
  });

  test('locks an exact John Deere match at the floor’s Read At', () => {
    expect(estimateReadAt(1000, facts())).toEqual({
      kind: 'telematics',
      readAt: at('10:00'),
      floor: deereFloor,
      ceiling: null,
      overAWeek: false,
    });
  });

  test('locks a value between two John Deere reports, bounded by when the ceiling’s value was first seen', () => {
    expect(estimateReadAt(1005, facts())).toMatchObject({ kind: 'telematics', readAt: at('10:30') });
    const moved = { ...deereCeiling, capturedAt: at('15:00'), createdAt: at('11:00') };
    expect(estimateReadAt(1005, facts({ ceiling: moved }))).toMatchObject({
      kind: 'telematics',
      readAt: at('10:30'),
      ceiling: { capturedAt: at('11:00') },
    });
  });

  test('keeps a moved report’s ceiling after a captured floor read since it was first seen', () => {
    const moved = { ...neighbour('deere-ceiling', 1010, '15:00', 'john-deere'), createdAt: at('11:00') };
    const humanFloor = neighbour('human-floor', 1009, '14:00');
    expect(estimateReadAt(1009.5, facts({ floor: humanFloor, ceiling: moved }))).toMatchObject({
      kind: 'human',
      readAt: at('14:30'),
    });
  });

  test('guesses between readings of which one is human', () => {
    const human = neighbour('human', 1010, '11:00');
    expect(estimateReadAt(1005, facts({ ceiling: human }))).toMatchObject({ kind: 'human', readAt: at('10:30') });
    expect(
      estimateReadAt(1005, facts({ floor: neighbour('human-floor', 1000, '10:00'), ceiling: human })),
    ).toMatchObject({ kind: 'human', readAt: at('10:30') });
  });

  test('has nothing without a floor, or above a floor with no ceiling', () => {
    expect(estimateReadAt(1005, facts({ floor: null }))).toEqual({ kind: 'none' });
    expect(estimateReadAt(1005, facts({ ceiling: null }))).toEqual({ kind: 'none' });
  });

  test('flags a date over a week ago', () => {
    expect(estimateReadAt(1005, facts({ now: new Date('2026-10-15T10:31:00Z') }))).toMatchObject({ overAWeek: true });
    expect(estimateReadAt(1005, facts({ now: new Date('2026-10-15T10:29:00Z') }))).toMatchObject({ overAWeek: false });
  });

  test('says the date on the estimate line', () => {
    expect(estimateSentence({ kind: 'now' })).toBe('Read now');
    expect(estimateSentence(estimateReadAt(1005, facts()))).toBe(
      `Read on ${formatDate(at('10:30'), 'medium')} per John Deere`,
    );
    expect(estimateSentence(estimateReadAt(1005, facts({ ceiling: neighbour('human', 1010, '11:00') })))).toBe(
      `Read about ${formatDate(at('10:30'), 'medium')}`,
    );
  });
});

describe('deriveCaptureForm', () => {
  const iso = (date: Date) => date.toISOString() as never;
  const wireNeighbour = { value: 100, capturedAt: iso(anHourAgo), telematicsProvider: null };
  const guess = (readAt: Date) =>
    ({ kind: 'human', readAt: iso(readAt), floor: wireNeighbour, ceiling: null, overAWeek: false }) as const;
  const deere = (readAt: Date) =>
    ({
      kind: 'telematics',
      readAt: iso(readAt),
      floor: { ...wireNeighbour, telematicsProvider: 'john-deere' },
      ceiling: null,
      overAWeek: false,
    }) as const;
  const formWorld = (overrides: Partial<CaptureFormWorld> = {}): CaptureFormWorld => ({ now, ...overrides });
  const draft = (overrides: Partial<CaptureDraft> = {}): CaptureDraft => ({
    ...CAPTURE_STEPS_START,
    when: 'today',
    value: '120',
    estimate: { kind: 'now' },
    comment: '',
    ...overrides,
  });
  /** The draft with its date vouched for, as Date looks good leaves it. */
  const confirmed = (given: CaptureDraft, world = formWorld()): CaptureDraft => ({
    ...given,
    dateConfirmed: confirmCaptureDate(deriveCaptureForm(world, given)),
  });

  test('parses a typed value, comma or point, and nothing when blank or too precise', () => {
    expect(deriveCaptureForm(formWorld(), draft({ value: '12,5' })).parsed).toBe(12.5);
    expect(deriveCaptureForm(formWorld(), draft({ value: '  ' })).parsed).toBeNull();
    expect(deriveCaptureForm(formWorld(), draft({ value: '12.34' }))).toMatchObject({ parsed: null, request: null });
  });

  test('reveals when, then hours, then the date, then the details', () => {
    expect(deriveCaptureForm(formWorld(), draft({ when: null })).step).toBe('when');
    expect(deriveCaptureForm(formWorld(), draft({ value: '' })).step).toBe('hours');
    expect(deriveCaptureForm(formWorld(), draft({ estimate: undefined }))).toMatchObject({
      step: 'hours',
      estimateLine: null,
    });
    expect(deriveCaptureForm(formWorld(), draft())).toMatchObject({
      step: 'date',
      estimateLine: 'Read now',
      date: { readAt: null, locked: false, warningLines: [], confirmable: true },
      request: null,
      answers: null,
    });
    expect(deriveCaptureForm(formWorld(), confirmed(draft({ comment: '  Gate open  ' })))).toMatchObject({
      step: 'details',
      request: { value: 120, comment: 'Gate open' },
      answers: { when: 'today', estimateKind: 'now', dateEdited: false },
    });
  });

  test('stops at the hours with the sentence when no date can be right', () => {
    const impossible = { kind: 'impossible', sentence: 'The meter cannot have reached 145.0 h yet.' } as const;
    expect(deriveCaptureForm(formWorld(), confirmed(draft({ value: '145', estimate: impossible })))).toMatchObject({
      step: 'hours',
      estimateLine: impossible.sentence,
      date: null,
      request: null,
    });
  });

  test('re-asks for the date when the hours or Today / Earlier change', () => {
    const done = confirmed(draft());
    expect(deriveCaptureForm(formWorld(), { ...done, value: '121' }).step).toBe('date');
    expect(
      deriveCaptureForm(formWorld(), { ...done, ...captureStepsReducer(done, { type: 'when', when: 'earlier' }) }).step,
    ).toBe('date');
    const picked = confirmed(draft({ value: '90', pickedReadAt: aDayAgo }));
    expect(captureStepsReducer(picked, { type: 'value-edited' })).toMatchObject({
      ...CAPTURE_STEPS_START,
      when: 'today',
    });
  });

  test('locks a John Deere date, ignoring a pick, and posts it once confirmed', () => {
    const given = draft({ value: '90', estimate: deere(aDayAgo), pickedReadAt: anHourAgo });
    expect(deriveCaptureForm(formWorld(), given)).toMatchObject({
      date: { readAt: aDayAgo, locked: true, open: false },
    });
    expect(deriveCaptureForm(formWorld(), { ...given, when: 'earlier' }).date?.open).toBe(false);
    expect(deriveCaptureForm(formWorld(), confirmed(given))).toMatchObject({ step: 'details', request: { value: 90 } });
  });

  test('takes a guess, and lets the person change it', () => {
    const world = formWorld();
    const guessed = draft({ value: '90', estimate: guess(aDayAgo) });
    expect(deriveCaptureForm(world, guessed).date).toMatchObject({
      readAt: aDayAgo,
      source: 'estimate',
      line: `Read about ${formatDate(aDayAgo, 'medium')}`,
      locked: false,
      open: false,
    });
    expect(deriveCaptureForm(world, { ...guessed, dateOpened: true }).date?.open).toBe(true);
    expect(deriveCaptureForm(world, { ...guessed, when: 'earlier' }).date?.open).toBe(true);
    const twoDaysAgo = new Date(aDayAgo.getTime() - 86_400_000);
    expect(deriveCaptureForm(world, { ...guessed, pickedReadAt: twoDaysAgo }).date).toMatchObject({
      readAt: twoDaysAgo,
      source: 'picked',
      line: `Read on ${formatDate(twoDaysAgo, 'medium')}`,
    });
  });

  test('warns outside today only under Today, and over a week whichever was chosen', () => {
    const yesterday = draft({ estimate: guess(aDayAgo), value: '90' });
    const world = formWorld();
    expect(deriveCaptureForm(world, yesterday).date?.warningLines).toEqual([
      `This reading looks like it was read on ${formatDate(aDayAgo, 'short')}, not today.`,
    ]);
    expect(deriveCaptureForm(world, { ...yesterday, when: 'earlier' }).date?.warningLines).toEqual([]);
    const lastMonth = new Date('2026-09-09T08:00:00Z');
    expect(
      deriveCaptureForm(world, { ...yesterday, when: 'earlier', pickedReadAt: lastMonth }).date?.warningLines,
    ).toEqual([
      `Please check the hours: this reading would be from ${formatDate(lastMonth, 'medium')}, over a week ago.`,
    ]);
  });

  test('holds Date looks good on a date still to come', () => {
    const future = draft({ pickedReadAt: new Date('2026-10-09T08:00:01Z') });
    expect(deriveCaptureForm(formWorld(), future).date).toMatchObject({ futureReadAt: true, confirmable: false });
    expect(confirmCaptureDate(deriveCaptureForm(formWorld(), future))).toBeNull();
  });

  test('reopens the date on a refusal that proposes a Read At', () => {
    const done = confirmed(draft());
    expect(captureStepsReducer(done, { type: 'refused', proposal: guess(aDayAgo) })).toMatchObject({
      pickedReadAt: aDayAgo,
      dateConfirmed: null,
    });
    expect(captureStepsReducer(done, { type: 'refused', proposal: undefined })).toEqual(done);
  });

  test('withdraws Date looks good while the picker names no date, and takes it again from the verdict', () => {
    const done = confirmed(draft());
    const withdrawn = captureStepsReducer(done, { type: 'date-unconfirmed' });
    expect(deriveCaptureForm(formWorld(), { ...done, ...withdrawn }).step).toBe('date');
    const again = captureStepsReducer(withdrawn, {
      type: 'date-confirmed',
      verdict: deriveCaptureForm(formWorld(), { ...done, ...withdrawn }),
    });
    expect(again.dateConfirmed).toEqual(done.dateConfirmed);
  });
});

describe('isFutureReadAt', () => {
  const at = new Date('2026-10-01T10:00:00Z');

  test('is true one millisecond ahead and false at now', () => {
    expect(isFutureReadAt(new Date(at.getTime() + 1), at)).toBe(true);
    expect(isFutureReadAt(at, at)).toBe(false);
  });

  test('allows the tolerance: false at now + tolerance, true one millisecond past it', () => {
    const limit = new Date(at.getTime() + FUTURE_READ_AT_TOLERANCE_MS);
    expect(isFutureReadAt(limit, at, FUTURE_READ_AT_TOLERANCE_MS)).toBe(false);
    expect(isFutureReadAt(new Date(limit.getTime() + 1), at, FUTURE_READ_AT_TOLERANCE_MS)).toBe(true);
  });
});
