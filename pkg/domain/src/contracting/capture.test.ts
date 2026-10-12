import type { JobActionVerdict } from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import {
  type CaptureAttempt,
  type CaptureDraft,
  type CaptureFormWorld,
  type CaptureRule,
  type CaptureWorld,
  captureIsBelowLatest,
  captureNeedsComment,
  captureRefusals,
  deriveCaptureForm,
  FUTURE_READ_AT_TOLERANCE_MS,
  isFutureReadAt,
  judgeCapture,
} from './capture.js';

const now = new Date('2026-10-09T08:00:00Z');
const refusedJob: JobActionVerdict = {
  allowed: false,
  reason: 'not-your-job',
  message: 'This Job is assigned to another Foreman.',
};

const world = (overrides: Partial<CaptureWorld> = {}): CaptureWorld => ({
  latest: { id: 'latest', value: 100 },
  stint: 'planned',
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
    ['previous-changed', {}, { value: 90, disputePrevious: true, expectedPreviousId: 'older' }],
    ['below-latest', {}, { value: 90 }],
    ['baseline-exists', { mayBaseline: true, stint: null }, { role: 'baseline' }],
  ])('refuses %s', (rule, given, attempt) => {
    expect(judgeCapture(world(given), capture(attempt))).toMatchObject({ ok: false, rule });
  });

  test.each<[string, Partial<CaptureWorld>, Partial<CaptureAttempt>, string | null]>([
    ['an idle Machine reading its latest value', {}, { value: 100 }, null],
    ['the first reading of an empty ledger', { latest: null }, { value: 3 }, null],
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
      { mayBaseline: true, stint: null, latest: null },
      { role: 'baseline' },
      null,
    ],
  ])('accepts %s', (_name, given, attempt, disputes) => {
    expect(judgeCapture(world(given), capture(attempt))).toEqual({ ok: true, disputes });
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

describe('deriveCaptureForm', () => {
  const formWorld = (overrides: Partial<CaptureFormWorld> = {}): CaptureFormWorld => ({
    latest: { id: 'latest', value: 100 },
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
