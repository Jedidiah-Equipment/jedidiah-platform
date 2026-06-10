import { describe, expect, it } from 'vitest';

import {
  type GanttContextProps,
  getGanttCenteredDateFromScrollLeft,
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
