import type { JobActionVerdict } from '@pkg/schema/contracting';
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
  captureCrossesServiceDueSoon,
  captureIsBelowLatest,
  captureRefusals,
  confirmCaptureDate,
  deriveCaptureForm,
  type EstimateFacts,
  type EstimateNeighbour,
  earliestReadAtFor,
  estimateReadAt,
  estimateSentence,
  judgeCapture,
  proposesReadAt,
  stepsAfterReadEarlier,
  stepsAfterRefusal,
  stepsAfterValueEdit,
  stepsAfterWhen,
} from './capture.js';
import { FUTURE_READ_AT_TOLERANCE_MS, isFutureReadAt } from './read-at.js';

const now = new Date('2026-10-09T08:00:00Z');
const refusedJob: JobActionVerdict = {
  allowed: false,
  reason: 'not-your-job',
  message: 'This Job is assigned to another Foreman.',
};

const anHourAgo = new Date('2026-10-09T07:00:00Z');
const aDayAgo = new Date('2026-10-08T08:00:00Z');
const reading = (
  id: string,
  value: number,
  capturedAt: Date,
  telematicsProvider: CaptureNeighbour['telematicsProvider'] = null,
  role: CaptureNeighbour['role'] = 'spot',
): CaptureNeighbour => ({ id, role, value, capturedAt, telematicsProvider });

const world = (overrides: Partial<CaptureWorld> = {}): CaptureWorld => ({
  latest: { id: 'latest', value: 100 },
  previous: reading('latest', 100, aDayAgo),
  next: null,
  previousTelematics: null,
  nextTelematics: null,
  stint: 'planned',
  stintArrivedAt: null,
  lastDepartedAt: null,
  jobVerdict: { allowed: true },
  mayBaseline: false,
  machineRetired: false,
  implementValid: true,
  driverValid: true,
  now,
  futureToleranceMs: 0,
  ...overrides,
});

const capture = (overrides: Partial<CaptureAttempt> = {}): CaptureAttempt => ({
  role: 'arrival',
  value: 120,
  readAt: now,
  disputePrevious: false,
  expectedPreviousId: undefined,
  ...overrides,
});

describe('judgeCapture', () => {
  test.each<[CaptureRule, Partial<CaptureWorld>, Partial<CaptureAttempt>]>([
    ['baseline-forbidden', { stint: null }, { role: 'baseline' }],
    ['future-read-at', {}, { readAt: new Date('2026-10-09T08:00:01Z') }],
    ['retired-machine', { machineRetired: true }, {}],
    ['job-refused', { jobVerdict: refusedJob }, {}],
    ['implement-invalid', { implementValid: false }, {}],
    ['driver-invalid', { driverValid: false }, {}],
    ['already-arrived', { stint: 'on-site' }, {}],
    ['not-on-site', { stint: 'planned' }, { role: 'departure' }],
    ['departs-before-arrival', { stint: 'on-site', stintArrivedAt: now }, { role: 'departure', readAt: anHourAgo }],
    ['arrives-before-departure', { lastDepartedAt: now }, { readAt: anHourAgo }],
    // Stint order is judged before any value rule; resolveReadingAmendments pins the same order (AMD-05).
    ['arrives-before-departure', { lastDepartedAt: now, next: reading('next', 110, now) }, { readAt: anHourAgo }],
    ['previous-changed', {}, { value: 90, disputePrevious: true, expectedPreviousId: 'older' }],
    ['below-latest', {}, { value: 90 }],
    ['baseline-exists', { mayBaseline: true, stint: null }, { role: 'baseline' }],
    [
      'baseline-exists',
      { previous: null, next: reading('latest', 100, now, null, 'baseline') },
      { value: 99.5, readAt: anHourAgo },
    ],
  ])('refuses %s', (rule, given, attempt) => {
    expect(judgeCapture(world(given), capture(attempt))).toMatchObject({ ok: false, rule });
  });

  test.each<[string, Partial<CaptureWorld>, Partial<CaptureAttempt>, string | null]>([
    ['an idle Machine reading its latest value', {}, { value: 100 }, null],
    ['the first reading of an empty ledger', { latest: null, previous: null }, { value: 3 }, null],
    [
      'a dispute of the latest, naming it',
      {},
      { value: 90, disputePrevious: true, expectedPreviousId: 'latest' },
      'latest',
    ],
    ['a dispute that is not below the latest, disputing nothing', {}, { value: 110, disputePrevious: true }, null],
    ['a departure from a Machine on site', { stint: 'on-site' }, { role: 'departure' }, null],
    ['a spot reading with no stint', { stint: null, jobVerdict: null }, { role: 'spot' }, null],
    [
      'a Read At within the server’s tolerance',
      { futureToleranceMs: FUTURE_READ_AT_TOLERANCE_MS },
      { readAt: new Date('2026-10-09T08:04:00Z') },
      null,
    ],
    [
      'a first Baseline Reading by an administrator',
      { mayBaseline: true, stint: null, latest: null, previous: null },
      { role: 'baseline' },
      null,
    ],
  ])('accepts %s', (_name, given, attempt, disputes) => {
    expect(judgeCapture(world(given), capture(attempt))).toEqual({ ok: true, disputes });
  });

  describe('against its time neighbours', () => {
    const yesterday = (hour: number) => new Date(`2026-10-08T${String(hour).padStart(2, '0')}:00:00Z`);
    const arrivedYesterday = reading('yesterday', 999, yesterday(15));
    const today = reading('today', 1001, new Date('2026-10-09T06:00:00Z'));
    const between = world({
      latest: { id: 'today', value: 1001 },
      previous: arrivedYesterday,
      next: today,
      stintArrivedAt: arrivedYesterday.capturedAt,
    });
    const backdated = (value: number, overrides: Partial<CaptureAttempt> = {}) =>
      capture({ role: 'departure', value, readAt: yesterday(16), ...overrides });

    test('lands a day-late departure behind today’s reading', () => {
      expect(judgeCapture({ ...between, stint: 'on-site' }, backdated(1000.5))).toEqual({ ok: true, disputes: null });
    });

    test('accepts a value equal to either neighbour', () => {
      expect(judgeCapture({ ...between, stint: 'on-site' }, backdated(999))).toMatchObject({ ok: true });
      expect(judgeCapture({ ...between, stint: 'on-site' }, backdated(1001))).toMatchObject({ ok: true });
    });

    test('refuses a value above the next reading, naming it, with no dispute path', () => {
      expect(
        judgeCapture(
          { ...between, stint: 'on-site' },
          backdated(1002, { disputePrevious: true, expectedPreviousId: 'today' }),
        ),
      ).toEqual({
        ok: false,
        rule: 'above-next',
        reason: 'reading.above_next',
        message: `A later reading of ${formatHours(1001)} at ${formatDate(today.capturedAt, 'medium')} is lower. Check the time or the value.`,
      });
    });

    test('refuses a backdated value below its previous flat, even disputed', () => {
      expect(
        judgeCapture(
          { ...between, stint: 'on-site' },
          backdated(998, { disputePrevious: true, expectedPreviousId: 'today' }),
        ),
      ).toEqual({
        ok: false,
        rule: 'below-previous',
        reason: 'reading.below_latest',
        message: `A reading of ${formatHours(999)} at ${formatDate(arrivedYesterday.capturedAt, 'medium')} is higher. Check the time or the value.`,
      });
    });

    test('never disputes a Telematics Reading on either side', () => {
      const reported = reading('deere', 1000, anHourAgo, 'john-deere');
      const reportedLater = reading('deere-later', 1010, now);
      const telematics = { ...reportedLater, telematicsProvider: 'john-deere' as const };
      expect(
        judgeCapture(
          world({ latest: { id: 'deere', value: 1000 }, previous: reported, previousTelematics: reported }),
          capture({ value: 990, disputePrevious: true, expectedPreviousId: 'deere' }),
        ),
      ).toEqual({
        ok: false,
        rule: 'contradicts-telematics',
        reason: 'reading.below_latest',
        message: `John Deere reported ${formatHours(1000)} at ${formatDate(anHourAgo, 'medium')}. Check the time or the value.`,
      });
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
        reason: 'reading.above_next',
        message: `John Deere reported ${formatHours(1010)} at ${formatDate(now, 'medium')}. Check the time or the value.`,
      });
    });
  });

  test('answers to the nearest Telematics Reading even past a captured reading in between', () => {
    // John Deere said 1200 at 07:00; a Foreman's 1100 at 07:30 was left Disputed; a later 1150 is above that reading.
    const reported = reading('deere', 1200, new Date('2026-10-09T07:00:00Z'), 'john-deere');
    const disputed = reading('human', 1100, new Date('2026-10-09T07:30:00Z'), null);
    expect(
      judgeCapture(
        world({ latest: { id: 'human', value: 1100 }, previous: disputed, previousTelematics: reported }),
        capture({ value: 1150 }),
      ),
    ).toMatchObject({
      ok: false,
      rule: 'contradicts-telematics',
      reason: 'reading.below_latest',
      message: `John Deere reported ${formatHours(1200)} at ${formatDate(reported.capturedAt, 'medium')}. Check the time or the value.`,
    });
    const later = reading('deere-later', 1300, now, 'john-deere');
    expect(
      judgeCapture(
        world({
          latest: { id: 'deere-later', value: 1300 },
          previous: disputed,
          next: reading('human-later', 1250, new Date('2026-10-09T07:45:00Z'), null),
          nextTelematics: later,
        }),
        capture({ value: 1310, readAt: new Date('2026-10-09T07:40:00Z') }),
      ),
    ).toMatchObject({ rule: 'above-next', reason: 'reading.above_next' });
  });

  describe('the meter cannot outrun the clock', () => {
    const arrival = reading('arrival', 1232.8, new Date('2026-10-27T14:17:00Z'), null, 'arrival');
    const onSite = world({
      latest: { id: 'arrival', value: 1232.8 },
      previous: arrival,
      stint: 'on-site',
      stintArrivedAt: arrival.capturedAt,
      now: new Date('2026-10-27T14:19:00Z'),
    });
    const departure = (value: number, readAt = new Date('2026-10-27T14:19:00Z')) =>
      capture({ role: 'departure', value, readAt });

    test('refuses engine hours since the previous reading that the clock never allowed, naming it', () => {
      expect(judgeCapture(onSite, departure(1258.2))).toEqual({
        ok: false,
        rule: 'outruns-clock',
        reason: 'reading.outruns_clock',
        message: `${formatHours(25.4)} of engine time cannot pass in ${formatHours(0)} of clock time since the arrival reading of ${formatHours(1232.8)} at ${formatDate(arrival.capturedAt, 'medium')}. Check Read At on this reading, or correct that reading's Read At from its Job.`,
      });
    });

    test('refuses a backdated value the next reading could not have reached in time', () => {
      const next = reading('next', 1010, now, null, 'departure');
      expect(
        judgeCapture(
          world({ previous: null, next, latest: { id: 'next', value: 1010 } }),
          capture({ value: 1000, readAt: anHourAgo }),
        ),
      ).toMatchObject({
        rule: 'outruns-clock',
        message: expect.stringContaining('clock time before the departure reading'),
      });
    });

    test('allows an hour of slack', () => {
      expect(judgeCapture(onSite, departure(1233.7, arrival.capturedAt))).toMatchObject({ ok: true });
    });

    test('judges a Telematics previous like any other', () => {
      const reported = reading('deere', 1000, anHourAgo, 'john-deere');
      expect(
        judgeCapture(
          world({ latest: { id: 'deere', value: 1000 }, previous: reported, previousTelematics: reported }),
          capture({ value: 1005 }),
        ),
      ).toMatchObject({ rule: 'outruns-clock' });
    });
  });

  describe('proposing a Read At', () => {
    const at = (time: string) => new Date(`2026-10-08T${time}:00Z`);

    test('stays within the stint: a departure’s arrival, an arrival’s last departure', () => {
      expect(earliestReadAtFor('departure', { stintArrivedAt: at('10:45'), lastDepartedAt: at('09:00') })).toEqual(
        at('10:45'),
      );
      expect(earliestReadAtFor('arrival', { stintArrivedAt: null, lastDepartedAt: at('09:00') })).toEqual(at('09:00'));
      expect(earliestReadAtFor('spot', { stintArrivedAt: at('10:45'), lastDepartedAt: at('09:00') })).toBeNull();
    });

    test('is offered for the three value refusals, and only those', () => {
      const later = reading('deere-later', 1020, at('12:00'), 'john-deere');
      const contradicts = world({
        latest: { id: 'deere-later', value: 1020 },
        previous: later,
        previousTelematics: later,
      });
      const human = reading('human', 1020, at('12:00'));
      const belowPrevious = world({
        latest: { id: 'today', value: 1030 },
        previous: human,
        next: reading('today', 1030, now),
      });
      const belowLatest = world({ latest: { id: 'human', value: 1020 }, previous: human });
      const attempt = capture({ value: 1005, readAt: at('12:30') });
      for (const [given, rule] of [
        [contradicts, 'contradicts-telematics'],
        [belowPrevious, 'below-previous'],
        [belowLatest, 'below-latest'],
      ] as const) {
        const verdict = judgeCapture(given, attempt);
        expect(verdict).toMatchObject({ rule });
        expect(!verdict.ok && proposesReadAt(verdict.rule)).toBe(true);
      }
      for (const rule of ['above-next', 'outruns-clock', 'future-read-at', 'job-refused'] as const)
        expect(proposesReadAt(rule)).toBe(false);
    });
  });

  test('judges in the stated order', () => {
    expect(judgeCapture(world({ machineRetired: true, jobVerdict: refusedJob }), capture())).toMatchObject({
      rule: 'retired-machine',
    });
    expect(judgeCapture(world({ jobVerdict: refusedJob, implementValid: false }), capture())).toMatchObject({
      rule: 'job-refused',
    });
    expect(judgeCapture(world({ stint: 'on-site' }), capture({ value: 90 }))).toMatchObject({
      rule: 'already-arrived',
    });
  });

  test('a Job refusal keeps its Reading code and the Job Action metadata', () => {
    expect(judgeCapture(world({ jobVerdict: refusedJob }), capture())).toEqual({
      ok: false,
      rule: 'job-refused',
      reason: 'reading.forbidden',
      message: 'This Job is assigned to another Foreman.',
      refused: { action: 'capture', reason: 'not-your-job' },
    });
    const closed: JobActionVerdict = { allowed: false, reason: 'closed', message: 'This Job is closed.' };
    expect(judgeCapture(world({ jobVerdict: closed }), capture())).toMatchObject({
      reason: 'reading.wrong_status',
      refused: { action: 'capture', reason: 'closed' },
    });
  });

  test('every other refusal carries its rule’s code and sentence', () => {
    const { code, message } = captureRefusals['below-latest'];
    expect(judgeCapture(world(), capture({ value: 90 }))).toEqual({
      ok: false,
      rule: 'below-latest',
      reason: code,
      message,
    });
  });
});

describe('captureRefusals', () => {
  test('pairs every rule with its wire code and sentence', () => {
    expect(captureRefusals).toEqual({
      'baseline-forbidden': {
        code: 'reading.forbidden',
        message: 'Only a Contracting administrator can capture a Baseline Reading.',
      },
      'future-read-at': { code: 'reading.future_read_at', message: 'Read At cannot be in the future.' },
      'retired-machine': { code: 'reading.retired_machine', message: 'Cannot capture readings for a retired Machine.' },
      'implement-invalid': { code: 'reading.invalid_role', message: 'The selected Implement is no longer available.' },
      'driver-invalid': { code: 'reading.invalid_role', message: 'Select a person with the Contracting driver role.' },
      'already-arrived': { code: 'reading.invalid_role', message: 'This Machine Assignment already arrived.' },
      'not-on-site': { code: 'reading.invalid_role', message: 'This Machine Assignment is not on site.' },
      'departs-before-arrival': {
        code: 'reading.invalid_role',
        message: 'A departure cannot be read before its arrival. Check the time.',
      },
      'arrives-before-departure': {
        code: 'reading.invalid_role',
        message: "An arrival cannot be read before the Machine's last departure. Check the time.",
      },
      'previous-changed': {
        code: 'reading.previous_changed',
        message: 'Another reading landed first. Review the latest reading before resubmitting a dispute.',
      },
      'below-latest': {
        code: 'reading.below_latest',
        message: 'Reading is below the latest reading. Retake it or assert that the previous reading is wrong.',
      },
      'baseline-exists': { code: 'reading.baseline_exists', message: 'A Baseline Reading must be the first reading.' },
      'machine-busy': {
        code: 'reading.machine_on_site',
        message: 'This Machine is still on site on another Job — capture its departure there first.',
      },
      'implement-busy': {
        code: 'reading.implement_on_site',
        message: 'This Implement is still on site on another Job — capture its departure there first.',
      },
    });
  });
});

describe('captureCrossesServiceDueSoon', () => {
  const service = { newHours: 1460, nextServiceDueHours: 1500, threshold: 50 };

  test('crosses only when the capture becomes the latest reading', () => {
    expect(captureCrossesServiceDueSoon({ latest: { id: 'latest', value: 1400 }, next: null }, service)).toBe(true);
  });

  test('never crosses for a capture dated behind the latest', () => {
    const next = reading('latest', 1470, now);
    expect(captureCrossesServiceDueSoon({ latest: { id: 'latest', value: 1470 }, next }, service)).toBe(false);
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
    role: 'spot',
    latest: reading('latest', 1020, at('12:00'), 'john-deere'),
    floor: deereFloor,
    ceiling: deereCeiling,
    notBefore: null,
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

  test('refuses a locked date before the stint, and drops a guess there', () => {
    expect(estimateReadAt(1005, facts({ role: 'departure', notBefore: at('10:45') }))).toEqual({
      kind: 'impossible',
      sentence: `John Deere puts ${formatHours(1005)} before this stint's arrival at ${formatDate(at('10:45'), 'medium')}. Check the hours.`,
    });
    expect(estimateReadAt(1005, facts({ role: 'arrival', notBefore: at('10:45') }))).toMatchObject({
      sentence: expect.stringContaining("before the Machine's last departure"),
    });
    expect(estimateReadAt(1005, facts({ ceiling: neighbour('human', 1010, '11:00'), notBefore: at('10:45') }))).toEqual(
      { kind: 'none' },
    );
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
  const formWorld = (overrides: Partial<CaptureFormWorld> = {}): CaptureFormWorld => ({
    latest: { id: 'latest', value: 100, capturedAt: anHourAgo.toISOString(), telematicsProvider: null },
    now,
    ...overrides,
  });
  const draft = (overrides: Partial<CaptureDraft> = {}): CaptureDraft => ({
    role: 'arrival',
    ...CAPTURE_STEPS_START,
    when: 'today',
    value: '120',
    estimate: { kind: 'now' },
    comment: '',
    stintOverrides: undefined,
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
      date: { readAt: null, locked: false, warnings: [], confirmable: true },
      awaitingPerson: true,
      request: null,
    });
    expect(deriveCaptureForm(formWorld(), confirmed(draft({ comment: '  Gate open  ' })))).toMatchObject({
      step: 'details',
      awaitingPerson: false,
      request: {
        role: 'arrival',
        value: 120,
        comment: 'Gate open',
        disputePrevious: false,
        expectedPreviousId: 'latest',
      },
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
    expect(deriveCaptureForm(formWorld(), { ...done, ...stepsAfterWhen(done, 'earlier') }).step).toBe('date');
    const picked = confirmed(draft({ value: '90', pickedReadAt: aDayAgo, disputedReadingId: 'latest' }));
    expect(stepsAfterValueEdit(picked)).toMatchObject({ ...CAPTURE_STEPS_START, when: 'today' });
  });

  test('locks a John Deere date, ignoring a pick, and posts it once confirmed', () => {
    const given = draft({ value: '90', estimate: deere(aDayAgo), pickedReadAt: anHourAgo });
    expect(deriveCaptureForm(formWorld(), given)).toMatchObject({
      date: { readAt: aDayAgo, locked: true, open: false, disputeOffered: false, dispute: null },
      below: false,
    });
    expect(deriveCaptureForm(formWorld(), { ...given, when: 'earlier' }).date?.open).toBe(false);
    expect(deriveCaptureForm(formWorld(), confirmed(given))).toMatchObject({ step: 'details', request: { value: 90 } });
  });

  test('takes a guess below a John Deere latest, and lets the person change it', () => {
    const deereLatest = formWorld({
      latest: { id: 'deere', value: 100, capturedAt: anHourAgo.toISOString(), telematicsProvider: 'john-deere' },
    });
    const guessed = draft({ value: '90', estimate: guess(aDayAgo) });
    expect(deriveCaptureForm(deereLatest, guessed).date).toMatchObject({
      readAt: aDayAgo,
      source: 'estimate',
      line: `Read about ${formatDate(aDayAgo, 'medium')}`,
      locked: false,
      open: false,
    });
    expect(deriveCaptureForm(deereLatest, { ...guessed, dateOpened: true }).date?.open).toBe(true);
    expect(deriveCaptureForm(deereLatest, { ...guessed, when: 'earlier' }).date?.open).toBe(true);
    const twoDaysAgo = new Date(aDayAgo.getTime() - 86_400_000);
    expect(deriveCaptureForm(deereLatest, { ...guessed, pickedReadAt: twoDaysAgo }).date).toMatchObject({
      readAt: twoDaysAgo,
      source: 'picked',
      line: `Read on ${formatDate(twoDaysAgo, 'medium')}`,
    });
  });

  test('offers the dispute only below a human latest, until the person reads earlier or disputes', () => {
    const below = draft({ value: '90', estimate: guess(aDayAgo) });
    expect(deriveCaptureForm(formWorld(), below)).toMatchObject({
      step: 'date',
      date: {
        readAt: null,
        line: 'Read now',
        disputeOffered: true,
        awaitsFork: true,
        dispute: { readingId: 'latest', confirmed: false },
        confirmable: false,
      },
    });
    const readEarlier = { ...below, ...stepsAfterReadEarlier(below, below.estimate) };
    expect(deriveCaptureForm(formWorld(), readEarlier).date).toMatchObject({
      readAt: aDayAgo,
      source: 'estimate',
      disputeOffered: false,
      dispute: null,
    });
    expect(stepsAfterReadEarlier(below, { kind: 'none' })).toMatchObject({ pickedReadAt: null, dateOpened: true });
    const disputed = confirmed({ ...below, disputedReadingId: 'latest' });
    expect(deriveCaptureForm(formWorld(), disputed)).toMatchObject({
      step: 'details',
      request: { disputePrevious: true, expectedPreviousId: 'latest' },
    });
    // Undoing the dispute after Date looks good asks again.
    expect(deriveCaptureForm(formWorld(), { ...disputed, disputedReadingId: null }).step).toBe('date');
  });

  test('warns outside today only under Today, and over a week whichever was chosen', () => {
    const yesterday = draft({ estimate: guess(aDayAgo), value: '90' });
    const deereLatest = formWorld({
      latest: { id: 'deere', value: 100, capturedAt: anHourAgo.toISOString(), telematicsProvider: 'john-deere' },
    });
    expect(deriveCaptureForm(deereLatest, yesterday).date).toMatchObject({
      warnings: ['outside-today'],
      warningLines: [`This reading looks like it was read on ${formatDate(aDayAgo, 'short')}, not today.`],
    });
    expect(deriveCaptureForm(deereLatest, { ...yesterday, when: 'earlier' }).date?.warnings).toEqual([]);
    const lastMonth = new Date('2026-09-09T08:00:00Z');
    expect(
      deriveCaptureForm(deereLatest, { ...yesterday, when: 'earlier', pickedReadAt: lastMonth }).date?.warnings,
    ).toEqual(['over-a-week']);
  });

  test('holds Date looks good on a date still to come', () => {
    const future = draft({ pickedReadAt: new Date('2026-10-09T08:00:01Z') });
    expect(deriveCaptureForm(formWorld(), future)).toMatchObject({
      futureReadAt: true,
      date: { confirmable: false },
    });
    expect(confirmCaptureDate(deriveCaptureForm(formWorld(), future))).toBeNull();
  });

  test('reopens the date on a refusal that proposes a Read At, and on nothing else', () => {
    const done = confirmed(draft());
    expect(stepsAfterRefusal(done, guess(aDayAgo))).toMatchObject({ pickedReadAt: aDayAgo, dateConfirmed: null });
    expect(stepsAfterRefusal(done, undefined)).toBe(done);
  });

  test('names the latest only once it is known, and an empty ledger as null', () => {
    expect(
      deriveCaptureForm(formWorld({ latest: undefined }), confirmed(draft(), formWorld({ latest: undefined }))).request,
    ).not.toHaveProperty('expectedPreviousId');
    expect(
      deriveCaptureForm(formWorld({ latest: null }), confirmed(draft(), formWorld({ latest: null }))).request,
    ).toMatchObject({
      expectedPreviousId: null,
    });
  });

  test('passes stint overrides through only when given', () => {
    const overrides = { implementId: null, driverUserId: 'driver-1' };
    expect(deriveCaptureForm(formWorld(), confirmed(draft({ stintOverrides: overrides }))).request).toMatchObject({
      stintOverrides: overrides,
    });
    expect(deriveCaptureForm(formWorld(), confirmed(draft())).request).not.toHaveProperty('stintOverrides');
  });
});

describe('capture hints', () => {
  test('below the latest reading only when a latest exists and the value is under it', () => {
    expect(captureIsBelowLatest(90, { value: 100 })).toBe(true);
    expect(captureIsBelowLatest(100, { value: 100 })).toBe(false);
    expect(captureIsBelowLatest(90, null)).toBe(false);
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
