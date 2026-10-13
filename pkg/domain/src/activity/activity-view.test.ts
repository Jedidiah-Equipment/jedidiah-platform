import { DateIso } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import { activityViewFor, advanceActivityView } from './activity-view.js';

const iso = (value: string) => DateIso.parse(value);
const createdAt = iso('2026-10-01T08:00:00.000Z');

describe('the per-business Activity View', () => {
  test('reads a business that was never acknowledged as the account’s creation', () => {
    expect(activityViewFor({}, 'contracting', createdAt)).toBe(createdAt);
    expect(activityViewFor({ equipment: iso('2026-10-05T08:00:00.000Z') }, 'contracting', createdAt)).toBe(createdAt);
  });

  test('advances one business forward only, leaving the other untouched', () => {
    const map = { equipment: iso('2026-10-05T08:00:00.000Z') };
    const seen = iso('2026-10-06T09:00:00.000Z');

    expect(advanceActivityView(map, 'contracting', seen, createdAt)).toEqual({ ...map, contracting: seen });
    expect(advanceActivityView(map, 'equipment', iso('2026-10-04T08:00:00.000Z'), createdAt)).toBe(map);
    expect(advanceActivityView({}, 'contracting', iso('2026-09-30T08:00:00.000Z'), createdAt)).toEqual({});
  });
});
