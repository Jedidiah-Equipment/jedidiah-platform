import { expect, test } from 'vitest';
import { HoursHeatMapInput, isValidHoursHeatMapRange } from './hours-heat-map.js';

test('accepts a range of up to 366 days and refuses a backwards or longer one', () => {
  expect(isValidHoursHeatMapRange({ start: '2025-10-28', end: '2026-10-28' })).toBe(true);
  expect(isValidHoursHeatMapRange({ start: '2025-10-27', end: '2026-10-28' })).toBe(false);
  expect(isValidHoursHeatMapRange({ start: '2026-10-28', end: '2026-10-27' })).toBe(false);
});

test('checks the range only when both ends are named, and refuses unknown keys', () => {
  expect(HoursHeatMapInput.safeParse({}).success).toBe(true);
  expect(HoursHeatMapInput.safeParse({ start: '2020-01-01' }).success).toBe(true);
  expect(HoursHeatMapInput.safeParse({ start: '2026-06-07', end: '2026-06-01' }).success).toBe(false);
  expect(HoursHeatMapInput.safeParse({ direction: 'forward' }).success).toBe(false);
});
