import { expect, test } from 'vitest';
import { capturedAtFor, isBackdated, readAtFromInput, readAtFromPicker, readAtInputValue } from './read-at.js';

const now = new Date(2026, 9, 1, 12, 0, 0);

test('the request carries Read At when set, else the attempt’s own moment', () => {
  const attemptedAt = new Date('2026-10-01T10:00:00Z');
  const readAt = new Date('2026-10-01T05:30:00Z');
  expect(capturedAtFor(readAt, attemptedAt)).toBe('2026-10-01T05:30:00.000Z');
  expect(capturedAtFor(null, attemptedAt)).toBe('2026-10-01T10:00:00.000Z');
});

test('detects a backdated Read At', () => {
  expect(isBackdated(null, now)).toBe(false);
  expect(isBackdated(new Date(now.getTime() - 5 * 60_000), now)).toBe(false);
  expect(isBackdated(new Date(now.getTime() - 5 * 60_000 - 1), now)).toBe(true);
});

test('a minute picker names its held instant while it shows that minute, else the picked minute', () => {
  const held = new Date(2026, 9, 1, 9, 30, 27);
  expect(readAtFromPicker('2026-10-01T09:30', held)).toBe(held);
  expect(readAtFromPicker('2026-10-01T09:31', held)).toEqual(new Date(2026, 9, 1, 9, 31));
  expect(readAtFromPicker('2026-10-01T09:30', null)).toEqual(new Date(2026, 9, 1, 9, 30));
  expect(readAtFromPicker('', held)).toBeNull();
});

test('round-trips a local date and time through the datetime-local value', () => {
  const readAt = new Date(2026, 9, 3, 7, 5);
  expect(readAtInputValue(readAt)).toBe('2026-10-03T07:05');
  expect(readAtFromInput('2026-10-03T07:05')).toEqual(readAt);
});

test('reads a blank or unreadable datetime-local value as no Read At', () => {
  expect(readAtFromInput('')).toBeNull();
  expect(readAtFromInput('not a time')).toBeNull();
});
