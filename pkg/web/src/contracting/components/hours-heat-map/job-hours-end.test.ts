import { expect, test } from 'vitest';
import { jobHoursEnd } from './job-hours-end.js';

const arrived = { arrival: {} };

test('ends a finished Job at its latest departure, on the plant date', () => {
  expect(
    jobHoursEnd([
      { ...arrived, departure: { capturedAt: '2026-03-10T08:00:00+02:00' } },
      { ...arrived, departure: { capturedAt: '2026-03-12T23:30:00+02:00' } },
      { arrival: null, departure: null },
    ]),
  ).toBe('2026-03-12');
});

test('ends at today while a Machine is still on site or none has arrived', () => {
  expect(jobHoursEnd([{ ...arrived, departure: null }])).toBeUndefined();
  expect(
    jobHoursEnd([
      { ...arrived, departure: { capturedAt: '2026-03-10T08:00:00+02:00' } },
      { ...arrived, departure: null },
    ]),
  ).toBeUndefined();
  expect(jobHoursEnd([{ arrival: null, departure: null }])).toBeUndefined();
  expect(jobHoursEnd([])).toBeUndefined();
});
