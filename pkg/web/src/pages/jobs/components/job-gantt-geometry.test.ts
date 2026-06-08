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
  it('aligns a Johannesburg scheduling instant to the same local column as its job date key', () => {
    const saturdayJobStart = new Date('2026-06-05T22:00:00.000Z');

    expect(getJobGanttOffset(saturdayJobStart, gantt)).toBe(getJobCalendarDayOffset('2026-06-06', gantt));
  });

  it('uses the same local day width for slot hatch segments and off-day bands', () => {
    const saturdayJobStart = new Date('2026-06-05T22:00:00.000Z');
    const sundayJobStart = new Date('2026-06-06T22:00:00.000Z');

    expect(getJobGanttWidth(saturdayJobStart, sundayJobStart, gantt)).toBe(getJobCalendarDayWidth('2026-06-06', gantt));
  });

  it('bases slot widths on local column offsets instead of elapsed milliseconds', () => {
    const saturdayJobStart = new Date('2026-06-05T22:00:00.000Z');
    const tuesdayJobEnd = new Date('2026-06-08T22:00:00.000Z');

    expect(getJobGanttWidth(saturdayJobStart, tuesdayJobEnd, gantt)).toBe(
      getJobGanttOffsetDistance(saturdayJobStart, tuesdayJobEnd, gantt),
    );
  });

  it('sizes resize drag increments from the next additional working-day span', () => {
    const saturdayJobStart = new Date('2026-06-05T22:00:00.000Z');
    const tuesdayJobEnd = new Date('2026-06-08T22:00:00.000Z');
    const workingCalendar = {
      orgOffDays: new Set(['2026-06-06', '2026-06-07']),
    };

    expect(getJobGanttResizeStepWidth(tuesdayJobEnd, workingCalendar, gantt)).toBe(
      getJobCalendarDayWidth('2026-06-09', gantt),
    );
    expect(getJobGanttResizeStepWidth(tuesdayJobEnd, workingCalendar, gantt)).toBeLessThan(
      getJobGanttWidth(saturdayJobStart, tuesdayJobEnd, gantt),
    );
  });

  it('returns zero offset distance when a hatch segment starts at the slot start', () => {
    const saturdayJobStart = new Date('2026-06-12T22:00:00.000Z');

    expect(getJobGanttOffsetDistance(saturdayJobStart, saturdayJobStart, gantt)).toBe(0);
  });
});
