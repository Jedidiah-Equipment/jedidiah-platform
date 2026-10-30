import type { JobActionVerdict } from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import { formatDate } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import {
  type CaptureAttempt,
  type CaptureDraft,
  type CaptureFormWorld,
  type CaptureNeighbour,
  type CaptureRule,
  type CaptureWorld,
  captureCrossesServiceDueSoon,
  captureIsBelowLatest,
  captureNeedsComment,
  captureRefusals,
  captureValueVerdict,
  deriveCaptureForm,
  judgeCapture,
  readAtSuggestionSentence,
  suggestReadAt,
  type ValueBracket,
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
const noBracket: ValueBracket = { floor: null, ceiling: null };
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
  valueBracket: noBracket,
  stint: 'planned',
  stintArrivedAt: null,
  lastDepartedAt: null,
  jobVerdict: { allowed: true },
  management: false,
  mayBaseline: false,
  machineRetired: false,
  implementValid: true,
  driverValid: true,
  hasPhoto: true,
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
  comment: null,
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
    ['comment-required', { management: true, hasPhoto: false, stint: 'on-site' }, { role: 'departure' }],
    ['already-arrived', { stint: 'on-site' }, {}],
    ['not-on-site', { stint: 'planned' }, { role: 'departure' }],
    ['departs-before-arrival', { stint: 'on-site', stintArrivedAt: now }, { role: 'departure', readAt: anHourAgo }],
    ['arrives-before-departure', { lastDepartedAt: now }, { readAt: anHourAgo }],
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
    [
      'a Foreman’s photo-less departure without a comment',
      { stint: 'on-site', hasPhoto: false },
      { role: 'departure' },
      null,
    ],
    [
      'a manager’s photo-less departure that says why',
      { stint: 'on-site', management: true, hasPhoto: false },
      { role: 'departure', comment: 'Camera broken' },
      null,
    ],
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
    const floor = reading('deere-floor', 1000, at('10:00'), 'john-deere');
    const ceiling = reading('deere-ceiling', 1010, at('11:00'), 'john-deere');
    const bracket: ValueBracket = { floor, ceiling };

    test('is the floor’s Read At when the value matches it', () => {
      expect(suggestReadAt(1000, bracket, null)).toEqual({ readAt: floor.capturedAt, floor, ceiling: null });
    });

    test('interpolates on hours between the bracketing reports', () => {
      expect(suggestReadAt(1005, bracket, null)).toEqual({ readAt: at('10:30'), floor, ceiling });
    });

    test('proposes nothing without a floor, or above a floor with no ceiling', () => {
      expect(suggestReadAt(1005, { floor: null, ceiling }, null)).toBeNull();
      expect(suggestReadAt(1005, { floor, ceiling: null }, null)).toBeNull();
    });

    test('proposes nothing that would break the stint’s time order', () => {
      expect(suggestReadAt(1005, bracket, at('10:45'))).toBeNull();
    });

    test('says which reports the proposal came from', () => {
      expect(readAtSuggestionSentence({ floor, ceiling })).toBe(
        `John Deere puts this reading between ${formatDate(floor.capturedAt, 'medium')} and ${formatDate(ceiling.capturedAt, 'medium')}.`,
      );
      expect(
        readAtSuggestionSentence({ floor: { value: 1000, capturedAt: floor.capturedAt.toISOString() }, ceiling: null }),
      ).toBe(`John Deere read ${formatHours(1000)} at ${formatDate(floor.capturedAt, 'medium')}.`);
    });

    test('rides on the three value refusals when John Deere brackets the value, and only then', () => {
      const suggestedReadAt = { readAt: at('10:30'), floor, ceiling };
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
        expect(judgeCapture({ ...given, valueBracket: bracket }, attempt)).toMatchObject({ rule, suggestedReadAt });
        expect(judgeCapture(given, attempt)).not.toHaveProperty('suggestedReadAt');
      }
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
      'comment-required': {
        code: 'reading.invalid_role',
        message: 'A reason is required for a photo-less departure reading.',
      },
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

describe('deriveCaptureForm', () => {
  const formWorld = (overrides: Partial<CaptureFormWorld> = {}): CaptureFormWorld => ({
    latest: { id: 'latest', value: 100, capturedAt: anHourAgo.toISOString(), telematicsProvider: null },
    management: false,
    hasPhoto: true,
    now,
    ...overrides,
  });
  const draft = (overrides: Partial<CaptureDraft> = {}): CaptureDraft => ({
    role: 'arrival',
    value: '120',
    disputedReadingId: null,
    comment: '',
    readAt: null,
    stintOverrides: undefined,
    ...overrides,
  });

  test('parses a typed value, comma or point, and nothing when blank or too precise', () => {
    expect(deriveCaptureForm(formWorld(), draft({ value: '12,5' })).parsed).toBe(12.5);
    expect(deriveCaptureForm(formWorld(), draft({ value: '  ' })).parsed).toBeNull();
    expect(deriveCaptureForm(formWorld(), draft({ value: '12.34' }))).toMatchObject({ parsed: null, request: null });
  });

  test('builds the request a passing draft posts, naming the latest it was judged against', () => {
    expect(deriveCaptureForm(formWorld(), draft({ comment: '  Gate open  ' })).request).toEqual({
      role: 'arrival',
      value: 120,
      comment: 'Gate open',
      disputePrevious: false,
      expectedPreviousId: 'latest',
    });
  });

  test('withholds a below-latest value until the latest is disputed', () => {
    expect(deriveCaptureForm(formWorld(), draft({ value: '90' }))).toMatchObject({
      below: true,
      disputeConfirmed: false,
      request: null,
    });
    expect(deriveCaptureForm(formWorld(), draft({ value: '90', disputedReadingId: 'latest' }))).toMatchObject({
      disputeConfirmed: true,
      request: { disputePrevious: true, expectedPreviousId: 'latest' },
    });
    expect(deriveCaptureForm(formWorld(), draft({ value: '90', disputedReadingId: 'older' })).request).toBeNull();
  });

  test('posts a draft below a Telematics latest, which the server answers with a Read At, and offers no dispute', () => {
    const deere = formWorld({
      latest: { id: 'deere', value: 100, capturedAt: anHourAgo.toISOString(), telematicsProvider: 'john-deere' },
    });
    expect(deriveCaptureForm(deere, draft({ value: '90' }))).toMatchObject({
      below: true,
      disputable: false,
      request: { value: 90, disputePrevious: false },
    });
    expect(captureValueVerdict(deere.latest, 90, 'deere', null)).toEqual({
      below: true,
      disputable: false,
      disputeConfirmed: false,
    });
  });

  test('leaves a Read At before the latest to the server, and pre-judges one at or after it', () => {
    expect(
      deriveCaptureForm(formWorld(), draft({ value: '90', readAt: new Date('2026-10-09T06:59:00Z') })),
    ).toMatchObject({
      below: false,
      request: { value: 90, disputePrevious: false },
    });
    expect(deriveCaptureForm(formWorld(), draft({ value: '90', readAt: anHourAgo }))).toMatchObject({
      below: true,
      request: null,
    });
  });

  test('withholds a manager’s photo-less departure until it says why', () => {
    const photoLess = formWorld({ management: true, hasPhoto: false });
    expect(deriveCaptureForm(photoLess, draft({ role: 'departure' }))).toMatchObject({
      commentRequired: true,
      request: null,
    });
    expect(deriveCaptureForm(photoLess, draft({ role: 'departure', comment: 'Camera broken' })).request).not.toBeNull();
  });

  test('withholds a Read At still to come', () => {
    expect(deriveCaptureForm(formWorld(), draft({ readAt: new Date('2026-10-09T08:00:01Z') }))).toMatchObject({
      futureReadAt: true,
      request: null,
    });
  });

  test('names the latest only once it is known, and an empty ledger as null', () => {
    expect(deriveCaptureForm(formWorld({ latest: undefined }), draft()).request).not.toHaveProperty(
      'expectedPreviousId',
    );
    expect(deriveCaptureForm(formWorld({ latest: null }), draft()).request).toMatchObject({ expectedPreviousId: null });
  });

  test('passes stint overrides through only when given', () => {
    const overrides = { implementId: null, driverUserId: 'driver-1' };
    expect(deriveCaptureForm(formWorld(), draft({ stintOverrides: overrides })).request).toMatchObject({
      stintOverrides: overrides,
    });
    expect(deriveCaptureForm(formWorld(), draft()).request).not.toHaveProperty('stintOverrides');
  });
});

describe('capture hints', () => {
  test('below the latest reading only when a latest exists and the value is under it', () => {
    expect(captureIsBelowLatest(90, { value: 100 })).toBe(true);
    expect(captureIsBelowLatest(100, { value: 100 })).toBe(false);
    expect(captureIsBelowLatest(90, null)).toBe(false);
  });

  test("only management's photo-less departure needs a comment", () => {
    expect(captureNeedsComment('departure', { management: true, hasPhoto: false })).toBe(true);
    expect(captureNeedsComment('departure', { management: true, hasPhoto: true })).toBe(false);
    expect(captureNeedsComment('departure', { management: false, hasPhoto: false })).toBe(false);
    expect(captureNeedsComment('arrival', { management: true, hasPhoto: false })).toBe(false);
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
