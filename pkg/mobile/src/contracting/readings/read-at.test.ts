import { expect, test } from 'vitest';
import { capturedAtFor, isBackdated, parseExifDateTime } from './read-at';

const now = new Date(2026, 9, 1, 12, 0, 0);

test('reads EXIF DateTimeOriginal as the phone’s local time, falling back to the other EXIF stamps', () => {
  expect(parseExifDateTime({ DateTimeOriginal: '2026:10:01 07:15:30' }, now)).toEqual(new Date(2026, 9, 1, 7, 15, 30));
  expect(parseExifDateTime({ DateTimeDigitized: '2026:09:30 18:00:00' }, now)).toEqual(new Date(2026, 8, 30, 18));
  expect(parseExifDateTime({ DateTime: '2026:09:29 06:00:00' }, now)).toEqual(new Date(2026, 8, 29, 6));
});

test('a missing, malformed or future EXIF time leaves Read At at now', () => {
  expect(parseExifDateTime(null, now)).toBeNull();
  expect(parseExifDateTime({}, now)).toBeNull();
  expect(parseExifDateTime({ DateTimeOriginal: '2026-10-01T07:15:30' }, now)).toBeNull();
  expect(parseExifDateTime({ DateTimeOriginal: 20261001 }, now)).toBeNull();
  expect(parseExifDateTime({ DateTimeOriginal: '2026:10:01 12:00:01' }, now)).toBeNull();
});

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
