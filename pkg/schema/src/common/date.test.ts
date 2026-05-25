import { describe, expect, it } from 'vitest';
import { DateIso, DateOnlyIso } from './date.js';

describe('DateIso', () => {
  it('accepts ISO date-only strings', () => {
    expect(DateIso.parse('2026-05-25')).toBe('2026-05-25');
  });

  it('accepts ISO datetime strings', () => {
    expect(DateIso.parse('2026-05-25T12:34:56.789Z')).toBe('2026-05-25T12:34:56.789Z');
  });

  it('accepts Dates as ISO datetime strings', () => {
    expect(DateIso.parse(new Date('2026-05-25T12:34:56.789Z'))).toBe('2026-05-25T12:34:56.789Z');
  });

  it('rejects non-ISO strings', () => {
    expect(DateIso.safeParse('May 25, 2026').success).toBe(false);
  });
});

describe('DateOnlyIso', () => {
  it('accepts ISO date-only strings', () => {
    expect(DateOnlyIso.parse('2026-05-25')).toBe('2026-05-25');
  });

  it('accepts Dates as ISO date-only strings', () => {
    expect(DateOnlyIso.parse(new Date('2026-05-25T12:34:56.789Z'))).toBe('2026-05-25');
  });

  it('rejects datetimes', () => {
    expect(DateOnlyIso.safeParse('2026-05-25T12:00:00.000Z').success).toBe(false);
  });
});
