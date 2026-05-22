import { describe, expect, it } from 'vitest';

import { computeDefaults, type ProductPerDeptConfig } from './defaults.js';

describe('computeDefaults', () => {
  it('builds the five-department duration stack forward from a start anchor', () => {
    const result = computeDefaults({
      anchor: {
        kind: 'start',
        value: date('2026-05-01'),
      },
      productPerDeptConfig: productConfig,
    });

    expect(toStageIso(result.stages)).toEqual([
      { stage: 'procurement', plannedStart: '2026-05-01', plannedEnd: '2026-05-03', durationDays: 2 },
      { stage: 'supply', plannedStart: '2026-05-03', plannedEnd: '2026-05-04', durationDays: 1 },
      { stage: 'fabrication', plannedStart: '2026-05-04', plannedEnd: '2026-05-07', durationDays: 3 },
      { stage: 'paint', plannedStart: '2026-05-07', plannedEnd: '2026-05-08', durationDays: 1 },
      { stage: 'assembly', plannedStart: '2026-05-08', plannedEnd: '2026-05-10', durationDays: 2 },
    ]);
    expect(result.warning).toBeNull();
  });

  it('builds the five-department duration stack backward from an end anchor', () => {
    const result = computeDefaults({
      anchor: {
        kind: 'end',
        value: date('2026-05-10'),
      },
      productPerDeptConfig: productConfig,
    });

    expect(toStageIso(result.stages)).toEqual([
      { stage: 'procurement', plannedStart: '2026-05-01', plannedEnd: '2026-05-03', durationDays: 2 },
      { stage: 'supply', plannedStart: '2026-05-03', plannedEnd: '2026-05-04', durationDays: 1 },
      { stage: 'fabrication', plannedStart: '2026-05-04', plannedEnd: '2026-05-07', durationDays: 3 },
      { stage: 'paint', plannedStart: '2026-05-07', plannedEnd: '2026-05-08', durationDays: 1 },
      { stage: 'assembly', plannedStart: '2026-05-08', plannedEnd: '2026-05-10', durationDays: 2 },
    ]);
  });

  it('uses zero duration and no station defaults for unconfigured departments', () => {
    const result = computeDefaults({
      anchor: {
        kind: 'start',
        value: date('2026-05-01'),
      },
      productPerDeptConfig: [{ stage: 'fabrication', durationDays: 2, defaultStationIds: ['weld-bay-1'] }],
    });

    expect(toStageIso(result.stages)).toEqual([
      { stage: 'procurement', plannedStart: '2026-05-01', plannedEnd: '2026-05-01', durationDays: 0 },
      { stage: 'supply', plannedStart: '2026-05-01', plannedEnd: '2026-05-01', durationDays: 0 },
      { stage: 'fabrication', plannedStart: '2026-05-01', plannedEnd: '2026-05-03', durationDays: 2 },
      { stage: 'paint', plannedStart: '2026-05-03', plannedEnd: '2026-05-03', durationDays: 0 },
      { stage: 'assembly', plannedStart: '2026-05-03', plannedEnd: '2026-05-03', durationDays: 0 },
    ]);
    expect(result.stationBookings).toHaveLength(1);
  });

  it('returns warning-only infeasible schedules without clamping generated stages', () => {
    const result = computeDefaults({
      anchor: {
        kind: 'start',
        value: date('2026-05-01'),
      },
      pinnedWindow: {
        plannedEnd: date('2026-05-05'),
        plannedStart: date('2026-05-01'),
      },
      productPerDeptConfig: productConfig,
    });

    expect(result.warning?.kind).toBe('infeasible-window');
    expect(toStageIso(result.stages).at(-1)).toEqual({
      stage: 'assembly',
      plannedStart: '2026-05-08',
      plannedEnd: '2026-05-10',
      durationDays: 2,
    });
  });

  it('uses parent stage windows verbatim for station booking windows', () => {
    const result = computeDefaults({
      anchor: {
        kind: 'start',
        value: date('2026-05-01'),
      },
      productPerDeptConfig: productConfig,
    });

    expect(toStationIso(result.stationBookings)).toEqual([
      { stage: 'procurement', stationId: 'procurement-1', plannedStart: '2026-05-01', plannedEnd: '2026-05-03' },
      { stage: 'fabrication', stationId: 'weld-bay-1', plannedStart: '2026-05-04', plannedEnd: '2026-05-07' },
      { stage: 'fabrication', stationId: 'weld-bay-2', plannedStart: '2026-05-04', plannedEnd: '2026-05-07' },
      { stage: 'paint', stationId: 'paint-booth-1', plannedStart: '2026-05-07', plannedEnd: '2026-05-08' },
    ]);
  });

  it('returns a warning instead of throwing when the pinned window is infeasible', () => {
    const result = computeDefaults({
      anchor: {
        kind: 'start',
        value: date('2026-05-01'),
      },
      pinnedWindow: {
        plannedEnd: date('2026-05-05'),
        plannedStart: date('2026-05-01'),
      },
      productPerDeptConfig: productConfig,
    });

    expect(result.warning).toEqual({
      kind: 'infeasible-window',
      message: 'The configured stage durations exceed the pinned job window.',
      totalDurationDays: 9,
      windowDays: 4,
    });
  });
});

const productConfig = [
  { stage: 'procurement', durationDays: 2, defaultStationIds: ['procurement-1'] },
  { stage: 'supply', durationDays: 1, defaultStationIds: [] },
  { stage: 'fabrication', durationDays: 3, defaultStationIds: ['weld-bay-1', 'weld-bay-2'] },
  { stage: 'paint', durationDays: 1, defaultStationIds: ['paint-booth-1'] },
  { stage: 'assembly', durationDays: 2, defaultStationIds: [] },
] as const satisfies readonly ProductPerDeptConfig[];

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toStageIso(stages: ReturnType<typeof computeDefaults>['stages']) {
  return stages.map((stage) => ({
    stage: stage.stage,
    plannedStart: toDateIso(stage.plannedStart),
    plannedEnd: toDateIso(stage.plannedEnd),
    durationDays: stage.durationDays,
  }));
}

function toStationIso(stationBookings: ReturnType<typeof computeDefaults>['stationBookings']) {
  return stationBookings.map((stationBooking) => ({
    stage: stationBooking.stage,
    stationId: stationBooking.stationId,
    plannedStart: toDateIso(stationBooking.plannedStart),
    plannedEnd: toDateIso(stationBooking.plannedEnd),
  }));
}

function toDateIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}
