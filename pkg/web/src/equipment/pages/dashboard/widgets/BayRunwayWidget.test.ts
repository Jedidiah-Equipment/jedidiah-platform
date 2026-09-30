import { DateOnlyIso, type UUID } from '@pkg/schema';
import { ProjectedBayQueue, ProjectedJobSlot } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { SHOP_FLOOR_BAND_HEIGHT_PX } from '../dashboard-widget-layout.js';
import { buildBayRunwayChartData, getBayRunwayChartHeight, hasBayRunwayScheduling } from './BayRunwayWidget.js';

const today = DateOnlyIso.parse('2026-08-19');

describe('BayRunwayWidget', () => {
  it('orders Bays by department and labels them with the operator before falling back to the Bay name', () => {
    const chartData = buildBayRunwayChartData({
      bays: [
        buildBay({ department: 'assembly', id: '30000000-0000-4000-8000-000000000000', name: 'Assembly' }),
        buildBay({
          department: 'fabrication',
          id: '10000000-0000-4000-8000-000000000000',
          name: 'Fabrication Bay 2',
          operatorName: 'Mkhukhu',
        }),
        buildBay({ department: 'procurement', id: '20000000-0000-4000-8000-000000000000', name: 'Procurement 1' }),
      ],
      today,
      workingCalendarsByBayId: new Map(),
    });

    expect(chartData.map(({ label }) => label)).toEqual(['Mkhukhu', 'Procurement 1', 'Assembly']);
    expect(chartData.map(({ identityDescription }) => identityDescription)).toEqual([
      'Mkhukhu - Fabrication Bay 2',
      'Procurement 1 - No operator',
      'Assembly - No operator',
    ]);
  });

  it('keeps remaining active work separate from scheduled work without spreading SVG overflow attributes', () => {
    const bay = buildBay({
      department: 'fabrication',
      id: '10000000-0000-4000-8000-000000000000',
      name: 'Fabrication Bay 2',
      slots: [
        buildWorkSlot({
          bayId: '10000000-0000-4000-8000-000000000000',
          endDate: '2026-08-21',
          id: '40000000-0000-4000-8000-000000000000',
          startDate: '2026-08-19',
          state: 'active',
        }),
        buildWorkSlot({
          bayId: '10000000-0000-4000-8000-000000000000',
          endDate: '2026-08-24',
          id: '50000000-0000-4000-8000-000000000000',
          startDate: '2026-08-21',
          state: 'scheduled',
        }),
      ],
    });

    expect(buildBayRunwayChartData({ bays: [bay], today, workingCalendarsByBayId: new Map() })[0]).toMatchObject({
      inProgressWorkDays: 2,
      scheduledWorkDays: 3,
    });
    expect(buildBayRunwayChartData({ bays: [bay], today, workingCalendarsByBayId: new Map() })[0]).not.toHaveProperty(
      'overflow',
    );
  });

  it('keeps a fixed height for every Bay row while the shared viewport scrolls', () => {
    expect(getBayRunwayChartHeight(4)).toBe(144);
    expect(getBayRunwayChartHeight(12)).toBeGreaterThan(SHOP_FLOOR_BAND_HEIGHT_PX);
  });

  it('hides rows without scheduling but keeps work beyond the runway window', () => {
    expect(hasBayRunwayScheduling({ inProgressWorkDays: 0, overflowLabel: '', scheduledWorkDays: 0 })).toBe(false);
    expect(hasBayRunwayScheduling({ inProgressWorkDays: 1, overflowLabel: '', scheduledWorkDays: 0 })).toBe(true);
    expect(hasBayRunwayScheduling({ inProgressWorkDays: 0, overflowLabel: '', scheduledWorkDays: 1 })).toBe(true);
    expect(hasBayRunwayScheduling({ inProgressWorkDays: 0, overflowLabel: '30+', scheduledWorkDays: 0 })).toBe(true);
  });
});

function buildBay({
  department,
  id,
  name,
  operatorName,
  slots = [],
}: {
  department: ProjectedBayQueue['department'];
  id: UUID;
  name: string;
  operatorName?: string;
  slots?: ProjectedBayQueue['slots'];
}) {
  return ProjectedBayQueue.parse({
    calendarExceptions: [],
    createdAt: '2026-08-01T08:00:00.000Z',
    currentOperator: operatorName
      ? {
          email: 'operator@example.com',
          id: `operator-${operatorName}`,
          name: operatorName,
          thumbnailDataUrl: null,
        }
      : null,
    department,
    disabledAt: null,
    id,
    name,
    nextAvailableDate: '2026-08-24',
    scheduleOrigin: '2026-08-01',
    slots,
    updatedAt: '2026-08-01T08:00:00.000Z',
  });
}

function buildWorkSlot({
  bayId,
  endDate,
  id,
  startDate,
  state,
}: {
  bayId: UUID;
  endDate: string;
  id: UUID;
  startDate: string;
  state: 'active' | 'scheduled';
}) {
  return ProjectedJobSlot.parse({
    bayId,
    createdAt: '2026-08-01T08:00:00.000Z',
    durationDays: 1,
    endDate,
    firstWorkDay: startDate,
    id,
    jobCode: 1,
    jobId: '60000000-0000-4000-8000-000000000000',
    jobUnfinished: true,
    kind: 'work',
    label: null,
    lastWorkDay: startDate,
    sequence: state === 'active' ? 1 : 2,
    startDate,
    state,
    updatedAt: '2026-08-01T08:00:00.000Z',
  });
}
