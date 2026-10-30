import type { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import {
  effectiveJobDates,
  hoursEditNeedsReason,
  johnDeereDifference,
  johnDeereDifferenceWarning,
  johnDeereLine,
  judgeStintHours,
  judgeStintHoursEdit,
  snapshotTravelHours,
} from './stint-hours.js';

describe('judgeStintHours', () => {
  it('refuses only a departure below the arrival, naming the arrival', () => {
    expect(judgeStintHours({ arrival: 4480, departure: 4479.9 })).toEqual({
      ok: false,
      refusal: {
        code: 'contracting_job.departure_before_arrival',
        message: 'Departure hours must be at or above the arrival hours of 4 480.0 h.',
      },
    });
    expect(judgeStintHours({ arrival: 4480, departure: 4480 })).toEqual({ ok: true });
    expect(judgeStintHours({ arrival: 4480, departure: null })).toEqual({ ok: true });
  });
});

describe('hoursEditNeedsReason', () => {
  it('asks for a reason once the Job has a Job Card', () => {
    expect(hoursEditNeedsReason('active')).toBe(false);
    expect(hoursEditNeedsReason('completed')).toBe(true);
    expect(hoursEditNeedsReason('priced')).toBe(true);
  });
});

describe('judgeStintHoursEdit', () => {
  const refusal = (verdict: ReturnType<typeof judgeStintHoursEdit>) => (verdict.ok ? null : verdict.refusal.code);
  const left = { status: 'completed', left: true } as const;

  it('asks for a reason once the Job has a Job Card, before anything else', () => {
    expect(refusal(judgeStintHoursEdit(left, { arrivalHours: 10, departureHours: 5, reason: '  ' }))).toBe(
      'contracting_job.reason_required',
    );
    expect(refusal(judgeStintHoursEdit(left, { arrivalHours: 10, departureHours: 12, reason: 'Misread' }))).toBeNull();
    expect(
      refusal(
        judgeStintHoursEdit(
          { status: 'active', left: true },
          { arrivalHours: 10, departureHours: 12, reason: undefined },
        ),
      ),
    ).toBeNull();
  });

  it('keeps the departure where the stint has one, then holds the one rule', () => {
    const edit = (departureHours: number | null, stintLeft: boolean) =>
      refusal(
        judgeStintHoursEdit({ status: 'active', left: stintLeft }, { arrivalHours: 10, departureHours, reason: null }),
      );
    expect(edit(null, true)).toBe('contracting_job.departure_not_editable');
    expect(edit(12, false)).toBe('contracting_job.departure_not_editable');
    expect(edit(9, true)).toBe('contracting_job.departure_before_arrival');
    expect(edit(null, false)).toBeNull();
  });
});

describe('snapshotTravelHours', () => {
  it('is the arrival less the previous departure, clamped at zero, and zero for a first arrival', () => {
    expect(snapshotTravelHours(4486, 4480)).toEqual({ travelHours: 6, clamped: false });
    expect(snapshotTravelHours(4480, 4512)).toEqual({ travelHours: 0, clamped: true });
    expect(snapshotTravelHours(4480, null)).toEqual({ travelHours: 0, clamped: false });
  });
});

describe('the John Deere comparison', () => {
  const now = new Date('2026-10-30T10:00:00Z');
  const today = { hours: 4512, at: '2026-10-30T12:05:00+02:00' };

  it('measures how far typed hours sit from the last report, and nothing for an unlinked Machine', () => {
    expect(johnDeereDifference(4480, today, 10)).toEqual({ hours: 32, over: true });
    expect(johnDeereDifference(4505, today, 10)).toEqual({ hours: 7, over: false });
    expect(johnDeereDifference(4480, null, 10)).toBeNull();
  });

  it('names the report today by its time and earlier by its date', () => {
    expect(johnDeereLine(today, now)).toBe('John Deere read 4 512.0 h at 12:05 today.');
    expect(johnDeereLine({ ...today, at: '2026-10-28T14:05:00+02:00' }, now)).toBe(
      'John Deere read 4 512.0 h on 28 Oct 2026, 14:05.',
    );
    expect(johnDeereDifferenceWarning(32, today, now)).toBe(
      "That is 32.0 h away from John Deere's last reading of 4 512.0 h at 12:05 today. Check the hours — you can still save.",
    );
  });
});

describe('effectiveJobDates', () => {
  const d = (value: string) => value as DateOnlyIso;
  const stint = (arrival: string, departure: string | null) => ({
    arrival: { at: arrival },
    departure: departure ? { at: departure } : null,
  });

  it('reads stored dates first', () => {
    expect(
      effectiveJobDates(
        { startDate: d('2026-10-01'), endDate: d('2026-10-21') },
        [stint('2026-10-05T08:00:00Z', null)],
        d('2026-10-30'),
      ),
    ).toEqual({ startDate: d('2026-10-01'), endDate: d('2026-10-21') });
  });

  it('runs an open Job from its first arrival to today, and a finished one to its last departure', () => {
    expect(
      effectiveJobDates({ startDate: null, endDate: null }, [stint('2026-10-05T08:00:00Z', null)], d('2026-10-30')),
    ).toEqual({
      startDate: d('2026-10-05'),
      endDate: d('2026-10-30'),
    });
    expect(
      effectiveJobDates(
        { startDate: null, endDate: null },
        [stint('2026-10-05T08:00:00Z', '2026-10-07T15:00:00Z')],
        d('2026-10-30'),
      ),
    ).toEqual({ startDate: d('2026-10-05'), endDate: d('2026-10-07') });
    expect(effectiveJobDates({ startDate: null, endDate: null }, [], d('2026-10-30'))).toBeNull();
  });
});
