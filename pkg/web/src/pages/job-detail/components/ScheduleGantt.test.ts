import type { JobDetail } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { buildScheduleGanttRows } from './ScheduleGantt.js';

describe('buildScheduleGanttRows', () => {
  it('keeps the Job, every Department stage, and station bookings on the chart', () => {
    const job = createJobDetail();

    expect(buildScheduleGanttRows(job)).toEqual([
      expect.objectContaining({ id: 'job-job-1', level: 'job', parentId: null, title: 'JOB-001' }),
      expect.objectContaining({ id: 'stage-stage-procurement', level: 'stage', parentId: null, title: 'Procurement' }),
      expect.objectContaining({
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
        id: 'station-booking-procurement-1',
        level: 'station',
        parentId: 'stage-stage-procurement',
        title: 'Procurement Desk',
      }),
      expect.objectContaining({ id: 'stage-stage-supply', level: 'stage', parentId: null, title: 'Supply' }),
      expect.objectContaining({ id: 'stage-stage-fabrication', level: 'stage', parentId: null, title: 'Fabrication' }),
      expect.objectContaining({
        actualEnd: null,
        actualStart: null,
        dueEnd: null,
        dueStart: null,
        id: 'station-booking-fabrication-1',
        level: 'station',
        parentId: 'stage-stage-fabrication',
        title: 'Weld Bay',
      }),
      expect.objectContaining({ id: 'stage-stage-paint', level: 'stage', parentId: null, title: 'Paint' }),
      expect.objectContaining({ id: 'stage-stage-assembly', level: 'stage', parentId: null, title: 'Assembly' }),
    ]);
  });
});

function createJobDetail(): JobDetail {
  const stages = [
    createStage('procurement', 1, [
      createStationBooking('procurement-1', 'Procurement Desk', {
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
      }),
    ]),
    createStage('supply', 2),
    createStage('fabrication', 3, [createStationBooking('fabrication-1', 'Weld Bay')]),
    createStage('paint', 4),
    createStage('assembly', 5),
  ];

  return {
    actualEnd: null,
    actualEndSetManually: false,
    actualStart: '2026-05-01T08:00:00.000Z',
    actualStartSetManually: false,
    code: 'JOB-001',
    createdAt: '2026-05-01T08:00:00.000Z',
    customerCompanyName: 'ACME',
    dueEnd: '2026-05-10',
    dueEndSetManually: false,
    dueStart: '2026-05-01',
    dueStartSetManually: false,
    id: 'job-1',
    isCancelled: false,
    isPaused: false,
    lifecycleStatus: 'active',
    productId: 'product-1',
    productModelCode: 'MODEL',
    productName: 'Machine',
    quoteCode: null,
    quoteId: null,
    stages,
    updatedAt: '2026-05-01T08:00:00.000Z',
    workflowEvents: [],
  } as unknown as JobDetail;
}

function createStage(stage: string, sequence: number, stations: unknown[] = []) {
  return {
    access: 'visible',
    actualEnd: null,
    actualEndSetManually: false,
    actualStart: null,
    actualStartSetManually: false,
    department: stage,
    dueEnd: null,
    dueEndSetManually: false,
    dueStart: null,
    dueStartSetManually: false,
    id: `stage-${stage}`,
    jobId: 'job-1',
    sequence,
    stage,
    state: 'pending',
    stations,
    transitionAvailability: {
      start: { allowed: true, reason: null },
      stop: { allowed: false, reason: 'Not started' },
    },
  };
}

function createStationBooking(id: string, name: string, dates: { dueEnd?: string; dueStart?: string } = {}) {
  return {
    actualEnd: null,
    actualEndSetManually: false,
    actualStart: null,
    actualStartSetManually: false,
    createdAt: '2026-05-01T08:00:00.000Z',
    dueEnd: dates.dueEnd ?? null,
    dueEndSetManually: false,
    dueStart: dates.dueStart ?? null,
    dueStartSetManually: false,
    id: `booking-${id}`,
    jobStageId: 'stage-1',
    state: 'pending',
    station: {
      createdAt: '2026-05-01T08:00:00.000Z',
      department: 'fabrication',
      id: `station-${id}`,
      name,
      status: 'active',
      updatedAt: '2026-05-01T08:00:00.000Z',
    },
    stationId: `station-${id}`,
    updatedAt: '2026-05-01T08:00:00.000Z',
  };
}
