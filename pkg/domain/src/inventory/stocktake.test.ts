import type { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { deriveStocktakeOverdue } from './stocktake.js';

const date = (value: string) => value as DateOnlyIso;

/** A plant that works Monday to Friday: every Saturday and Sunday of August 2026 is an Off-Day. */
const weekendsOff = {
  orgOffDays: new Set([
    '2026-08-01',
    '2026-08-02',
    '2026-08-08',
    '2026-08-09',
    '2026-08-15',
    '2026-08-16',
    '2026-08-22',
    '2026-08-23',
    '2026-08-29',
    '2026-08-30',
    '2026-09-05',
    '2026-09-06',
  ]),
};

describe('deriveStocktakeOverdue', () => {
  it('gives raw material a week plus two working days, skipping the weekend', () => {
    // Closed Friday 7 August: due Friday 14th, and two working days of grace land on Tuesday 18th.
    const row = deriveStocktakeOverdue({
      lastClosedOn: date('2026-08-07'),
      scope: 'raw-material',
      today: date('2026-08-18'),
      workingCalendar: weekendsOff,
    });

    expect(row).toEqual({
      dueBy: '2026-08-18',
      isOverdue: false,
      lastClosedOn: '2026-08-07',
      overdueDays: 0,
      scope: 'raw-material',
    });
  });

  it('reports raw material late the day after its grace runs out', () => {
    const row = deriveStocktakeOverdue({
      lastClosedOn: date('2026-08-07'),
      scope: 'raw-material',
      today: date('2026-08-20'),
      workingCalendar: weekendsOff,
    });

    expect(row).toMatchObject({ dueBy: '2026-08-18', isOverdue: true, overdueDays: 2 });
  });

  it('gives stores a calendar month plus five working days', () => {
    // Closed 3 July: due 3 August (a Monday), and five working days of grace reach Monday 10th.
    const row = deriveStocktakeOverdue({
      lastClosedOn: date('2026-07-03'),
      scope: 'stores',
      today: date('2026-08-10'),
      workingCalendar: weekendsOff,
    });

    expect(row).toMatchObject({ dueBy: '2026-08-10', isOverdue: false });
  });

  it('counts grace in calendar days when the plant declares no Off-Days', () => {
    const row = deriveStocktakeOverdue({
      lastClosedOn: date('2026-08-07'),
      scope: 'raw-material',
      today: date('2026-08-17'),
    });

    expect(row).toMatchObject({ dueBy: '2026-08-16', isOverdue: true, overdueDays: 1 });
  });

  it('treats a scope that has never been counted as overdue outright', () => {
    const row = deriveStocktakeOverdue({
      lastClosedOn: null,
      scope: 'stores',
      today: date('2026-08-10'),
      workingCalendar: weekendsOff,
    });

    // No date to count from, so it says that it is late without inventing how late.
    expect(row).toEqual({
      dueBy: '2026-08-10',
      isOverdue: true,
      lastClosedOn: null,
      overdueDays: 0,
      scope: 'stores',
    });
  });
});
