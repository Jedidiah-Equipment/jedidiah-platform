import { describe, expect, test } from 'vitest';
import { assignmentState, canComplete, completionGateReasons, deriveStintHours, suggestJobDates } from './hours.js';
import { formatJobNumber, looksFinished } from './jobs.js';

describe('contracting stint hours', () => {
  test('bills Work as departure less arrival, plus the stint’s Travel Hours', () => {
    expect(deriveStintHours({ arrivalHours: 4002.6, departureHours: 4051.2, travelHours: 2 })).toEqual({
      state: 'left',
      workHours: 48.6,
      billableHours: 50.6,
    });
  });

  test('bills zero Work hours when the departure equals the arrival', () => {
    expect(deriveStintHours({ arrivalHours: 4480, departureHours: 4480, travelHours: 0 })).toMatchObject({
      workHours: 0,
      billableHours: 0,
    });
  });

  test('has no Work or billable hours until the Machine leaves', () => {
    expect(deriveStintHours({ arrivalHours: 100, departureHours: null, travelHours: 3 })).toEqual({
      state: 'on-site',
      workHours: null,
      billableHours: null,
    });
    expect(assignmentState({ arrivalHours: null, departureHours: null })).toBe('planned');
  });

  test('suggests dates from when the first arrival and last departure were captured, in plant time', () => {
    expect(
      suggestJobDates([
        { arrival: { at: '2026-09-03T22:30:00Z' }, departure: { at: '2026-09-05T20:00:00Z' } },
        { arrival: { at: '2026-09-01T23:00:00Z' }, departure: { at: '2026-09-06T22:30:00Z' } },
      ]),
    ).toEqual({ startDate: '2026-09-02', endDate: '2026-09-07' });
  });

  test('completes only once no Machine is still on site, whatever needs a look', () => {
    expect(canComplete([{ state: 'left' }, { state: 'planned' }])).toEqual({ ok: true });
    const gate = canComplete([{ state: 'on-site' }, { state: 'on-site' }, { state: 'left' }]);
    expect(completionGateReasons(gate)).toEqual(['2 machines are still on site.']);
  });
});

describe('contracting jobs', () => {
  test('formats the public Job Number', () => expect(formatJobNumber(37)).toBe('CJOB-00037'));

  test('requires at least one left stint before an Active Job looks finished', () => {
    expect(looksFinished({ status: 'active' }, ['planned'])).toBe(false);
    expect(looksFinished({ status: 'active' }, ['left', 'planned'])).toBe(true);
    expect(looksFinished({ status: 'active' }, ['left', 'on-site'])).toBe(false);
    expect(looksFinished({ status: 'completed' }, ['left'])).toBe(false);
  });
});
