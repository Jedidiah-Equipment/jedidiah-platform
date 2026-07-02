import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  getInitialBoardHistoryFloor,
  getNextBoardHistoryFloor,
  startOfBoardHistoryMonth,
} from './board-history-floor.js';

const day = (value: string) => DateOnlyIso.parse(value);

describe('Board history floor', () => {
  it('opens with a two-week back-context snapped to the month bucket', () => {
    expect(getInitialBoardHistoryFloor(day('2026-07-01'))).toBe('2026-06-01');
    expect(getInitialBoardHistoryFloor(day('2026-01-10'))).toBe('2025-12-01');
  });

  it('snaps arbitrary dates to the first day of their month', () => {
    expect(startOfBoardHistoryMonth(day('2026-06-17'))).toBe('2026-06-01');
  });

  it('drops the floor by one bucket when the viewport starts before the loaded floor', () => {
    expect(getNextBoardHistoryFloor(day('2026-06-01'), day('2026-05-31'))).toBe('2026-05-01');
    expect(getNextBoardHistoryFloor(day('2026-01-01'), day('2025-12-31'))).toBe('2025-12-01');
  });

  it('loads one bucket at a time even when the viewport jumps further back', () => {
    expect(getNextBoardHistoryFloor(day('2026-06-01'), day('2026-04-15'))).toBe('2026-05-01');
  });

  it('does not move the floor when the viewport is inside the loaded range', () => {
    expect(getNextBoardHistoryFloor(day('2026-06-01'), day('2026-06-01'))).toBe('2026-06-01');
    expect(getNextBoardHistoryFloor(day('2026-06-01'), day('2026-06-20'))).toBe('2026-06-01');
  });

  it('never raises the floor when scrolling forward later in the session', () => {
    expect(getNextBoardHistoryFloor(day('2026-05-01'), day('2026-07-15'))).toBe('2026-05-01');
  });
});
