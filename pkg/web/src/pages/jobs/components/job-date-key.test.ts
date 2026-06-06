import { describe, expect, it } from 'vitest';

import { fromJobDateKey, toJobDateKey } from './job-date-key.js';

describe('job date keys', () => {
  it('formats dates using the Johannesburg business day', () => {
    expect(toJobDateKey(new Date('2026-06-18T21:59:59.000Z'))).toBe('2026-06-18');
    expect(toJobDateKey(new Date('2026-06-18T22:00:00.000Z'))).toBe('2026-06-19');
  });

  it('parses date keys as Johannesburg day starts', () => {
    expect(fromJobDateKey('2026-06-19')).toEqual(new Date('2026-06-18T22:00:00.000Z'));
  });

  it('round-trips date keys through the shared Johannesburg basis', () => {
    expect(toJobDateKey(fromJobDateKey('2026-06-19'))).toBe('2026-06-19');
  });
});
