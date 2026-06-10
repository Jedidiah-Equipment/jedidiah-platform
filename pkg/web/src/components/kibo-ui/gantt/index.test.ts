import { describe, expect, it } from 'vitest';

import {
  type GanttContextProps,
  getGanttCenteredDateFromScrollLeft,
  getGanttDailyHeaderWeekdayLabel,
  getGanttDateScrollLeft,
  type TimelineData,
} from './index.js';

const timelineData: TimelineData = [
  {
    year: 2026,
    quarters: [],
  },
];

const gantt: GanttContextProps = {
  columnWidth: 50,
  headerHeight: 60,
  placeholderLength: 2,
  range: 'daily',
  ref: null,
  rowHeight: 72,
  sidebarWidth: 300,
  timelineData,
  zoom: 200,
};

describe('Gantt date scrolling', () => {
  it('keeps start alignment on the existing two-column lead-in', () => {
    expect(getGanttDateScrollLeft(new Date(2026, 0, 10), gantt, { viewportWidth: 900 })).toBe(700);
  });

  it('centers a date inside the sidebar-aware visible timeline width', () => {
    expect(
      getGanttDateScrollLeft(new Date(2026, 0, 10), gantt, {
        alignment: 'center',
        viewportWidth: 900,
      }),
    ).toBe(600);
  });

  it('derives the date at the visible timeline center from raw scroll pixels', () => {
    expect(getGanttCenteredDateFromScrollLeft(600, gantt, 900)).toEqual(new Date(2026, 0, 10));
  });
});

describe('Gantt daily header labels', () => {
  const monday = new Date(2026, 5, 22);

  it('shows normal weekday labels above 95% zoom', () => {
    expect(getGanttDailyHeaderWeekdayLabel(monday, 100)).toBe('Mon');
  });

  it('shows compact weekday labels at 95% zoom and below', () => {
    expect(getGanttDailyHeaderWeekdayLabel(monday, 95)).toBe('m');
    expect(getGanttDailyHeaderWeekdayLabel(monday, 90)).toBe('m');
  });

  it('hides weekday labels at 80% zoom and below', () => {
    expect(getGanttDailyHeaderWeekdayLabel(monday, 80)).toBeNull();
    expect(getGanttDailyHeaderWeekdayLabel(monday, 60)).toBeNull();
  });
});
