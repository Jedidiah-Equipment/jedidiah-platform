import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import type { GanttContextProps, TimelineData } from '@/components/kibo-ui/gantt/index.js';
import {
  getJobCalendarDayOffset,
  getJobCalendarDayWidth,
  getJobGanttOffset,
  getJobGanttOffsetDistance,
  getJobGanttResizeStepWidth,
  getJobGanttWidth,
} from './job-gantt-geometry.js';

const day = (value: string) => DateOnlyIso.parse(value);

const timelineData: TimelineData = [
  {
    year: 2026,
    quarters: [],
  },
];

const gantt: GanttContextProps = {
  columnWidth: 36,
  headerHeight: 60,
  placeholderLength: 2,
  range: 'daily',
  ref: null,
  rowHeight: 72,
  sidebarWidth: 300,
  timelineData,
  zoom: 200,
};

describe('job Gantt geometry', () => {
  it('aligns a slot date key to the same local column as the calendar day helpers', () => {
    expect(getJobGanttOffset(day('2026-06-06'), gantt)).toBe(getJobCalendarDayOffset(day('2026-06-06'), gantt));
  });

  it('uses the same local day width for slot hatch segments and off-day bands', () => {
    expect(getJobGanttWidth(day('2026-06-06'), day('2026-06-07'), gantt)).toBe(
      getJobCalendarDayWidth(day('2026-06-06'), gantt),
    );
  });

  it('bases slot widths on local column offsets instead of elapsed milliseconds', () => {
    expect(getJobGanttWidth(day('2026-06-06'), day('2026-06-09'), gantt)).toBe(
      getJobGanttOffsetDistance(day('2026-06-06'), day('2026-06-09'), gantt),
    );
  });

  it('sizes resize drag increments from the next additional working-day span', () => {
    const workingCalendar = {
      orgOffDays: new Set(['2026-06-06', '2026-06-07']),
    };

    expect(getJobGanttResizeStepWidth(day('2026-06-09'), workingCalendar, gantt)).toBe(
      getJobCalendarDayWidth(day('2026-06-09'), gantt),
    );
    expect(getJobGanttResizeStepWidth(day('2026-06-09'), workingCalendar, gantt)).toBeLessThan(
      getJobGanttWidth(day('2026-06-06'), day('2026-06-09'), gantt),
    );
  });

  it('returns zero offset distance when a hatch segment starts at the slot start', () => {
    expect(getJobGanttOffsetDistance(day('2026-06-13'), day('2026-06-13'), gantt)).toBe(0);
  });
});
