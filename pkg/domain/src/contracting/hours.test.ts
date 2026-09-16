import { describe, expect, test } from 'vitest';
import { assignmentState, canComplete, deriveStintHours, suggestJobDates } from './hours.js';
import { formatJobNumber, looksFinished } from './jobs.js';

describe('contracting stint hours', () => {
  test.each([
    {
      name: 'excavator',
      arrival: 4002.6,
      departure: 4051.2,
      previous: 4000.6,
      expected: { workHours: 48.6, gapHours: 2, travelHours: 2, billableHours: 50.6, gapFlag: false },
    },
    {
      name: 'grader with open flag',
      arrival: 7110,
      departure: 7152.4,
      previous: 7100.5,
      expected: { workHours: 42.4, gapHours: 9.5, travelHours: 9.5, billableHours: 51.9, gapFlag: true },
    },
    {
      name: 'tractor',
      arrival: 7102.5,
      departure: 7141.3,
      previous: 7101.3,
      expected: { workHours: 38.8, gapHours: 1.2, travelHours: 1.2, billableHours: 40, gapFlag: false },
    },
  ])('derives the scenario-one $name stint', ({ arrival, departure, previous, expected }) => {
    expect(
      deriveStintHours({
        arrival: { value: arrival, capturedAt: '2026-09-01T08:00:00+02:00' },
        departure: { value: departure, capturedAt: '2026-09-02T17:00:00+02:00' },
        previousDeparture: { value: previous },
        travelIncluded: true,
        gap: null,
      }),
    ).toMatchObject(expected);
  });

  test('opens a first machine ledger without a gap or travel', () => {
    expect(
      deriveStintHours({
        arrival: { value: 100, capturedAt: '2026-09-01T08:00:00+02:00' },
        departure: null,
        previousDeparture: null,
        travelIncluded: true,
        gap: null,
      }),
    ).toEqual({
      state: 'on-site',
      workHours: null,
      gapHours: null,
      travelHours: 0,
      unaccountedHours: 0,
      gapFlag: false,
      billableHours: null,
    });
  });

  test('a travel exclusion suppresses unresolved travel and a resolution overrides it', () => {
    const stint = {
      arrival: { value: 110, capturedAt: '2026-09-01T08:00:00+02:00' },
      departure: { value: 120, capturedAt: '2026-09-01T17:00:00+02:00' },
      previousDeparture: { value: 100 },
      travelIncluded: false,
    } as const;
    expect(deriveStintHours({ ...stint, gap: null })).toMatchObject({ travelHours: 0, gapFlag: true });
    expect(deriveStintHours({ ...stint, gap: { travelHours: 2.5, unaccountedHours: 7.5 } })).toMatchObject({
      travelHours: 2.5,
      unaccountedHours: 7.5,
      gapFlag: false,
      billableHours: 12.5,
    });
  });

  test('keeps disputed backwards readings readable without inventing negative hours', () => {
    expect(
      deriveStintHours({
        arrival: { value: 5_000, capturedAt: '2026-09-01T08:00:00+02:00' },
        departure: { value: 4_900, capturedAt: '2026-09-01T17:00:00+02:00' },
        previousDeparture: { value: 5_100 },
        travelIncluded: true,
        gap: null,
      }),
    ).toMatchObject({
      workHours: null,
      gapHours: null,
      travelHours: 0,
      billableHours: null,
      gapFlag: false,
    });
  });

  test.each([
    [4, false],
    [4.1, true],
  ])('flags only gaps above the threshold (%s)', (gap, expected) => {
    expect(
      deriveStintHours({
        arrival: { value: 100 + gap, capturedAt: '2026-09-01T08:00:00+02:00' },
        departure: null,
        previousDeparture: { value: 100 },
        travelIncluded: true,
        gap: null,
      }).gapFlag,
    ).toBe(expected);
  });

  test('derives assignment state and completion blockers', () => {
    expect(assignmentState({ arrivalReadingId: null, departureReadingId: null })).toBe('planned');
    expect(assignmentState({ arrivalReadingId: 'a', departureReadingId: null })).toBe('on-site');
    expect(assignmentState({ arrivalReadingId: 'a', departureReadingId: 'd' })).toBe('left');
    expect(
      canComplete([
        {
          ...deriveStintHours({
            arrival: null,
            departure: null,
            previousDeparture: null,
            travelIncluded: true,
            gap: null,
          }),
        },
      ]),
    ).toEqual({ ok: true });
  });

  test('suggests dates across repeat stints in Johannesburg plant time', () => {
    const base = { previousDeparture: null, travelIncluded: true, gap: null } as const;
    expect(
      suggestJobDates([
        {
          ...base,
          arrival: { value: 10, capturedAt: '2026-09-03T22:30:00Z' },
          departure: { value: 20, capturedAt: '2026-09-05T20:00:00Z' },
        },
        {
          ...base,
          arrival: { value: 30, capturedAt: '2026-09-01T23:00:00Z' },
          departure: { value: 40, capturedAt: '2026-09-06T22:30:00Z' },
        },
      ]),
    ).toEqual({ startDate: '2026-09-02', endDate: '2026-09-07' });
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
