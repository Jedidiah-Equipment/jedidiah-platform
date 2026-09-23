import { DateIso } from '@pkg/schema';
import type { FieldDriver, FieldImplement, FieldJob, FieldMachine, FieldStint } from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import type { QueuedReading } from '@/contracting/readings/reading-queue';
import { deriveStint, jobSummary, queuedUnplannedStints } from './derive-stint';

const ids = {
  job: '5f1c2d3e-0001-4a00-8000-000000000001',
  stint: '5f1c2d3e-0001-4a00-8000-000000000002',
  machine: '5f1c2d3e-0001-4a00-8000-000000000003',
  implement: '5f1c2d3e-0001-4a00-8000-000000000004',
  arrival: '5f1c2d3e-0001-4a00-8000-000000000005',
  departure: '5f1c2d3e-0001-4a00-8000-000000000006',
  alternateImplement: '5f1c2d3e-0001-4a00-8000-000000000009',
};
const stint: FieldStint = {
  id: ids.stint,
  jobId: ids.job,
  machineId: ids.machine,
  machineCode: 'JD-1',
  categoryName: 'Tractors',
  categoryIcon: 'tractor',
  categoryColour: 'green',
  implementId: null,
  implementCode: null,
  driverUserId: null,
  driverName: null,
  state: 'planned',
  arrival: null,
  departure: null,
  createdAt: DateIso.parse('2026-09-17T06:00:00.000Z'),
};
const queued = (role: 'arrival' | 'departure', overrides: Partial<QueuedReading> = {}): QueuedReading => ({
  localId: role === 'arrival' ? ids.arrival : ids.departure,
  machineId: ids.machine,
  assignmentId: ids.stint,
  role,
  value: role === 'arrival' ? 100 : 110,
  capturedAt: role === 'arrival' ? '2026-09-17T07:00:00.000Z' : '2026-09-17T17:00:00.000Z',
  disputePrevious: false,
  photoLocalUri: null,
  comment: null,
  ...overrides,
});

describe('deriveStint', () => {
  test('advances every server state with queued captures and gives refusals precedence', () => {
    expect(deriveStint(stint, []).view).toBe('planned');
    expect(deriveStint(stint, [queued('arrival')]).view).toBe('starting');
    expect(deriveStint(stint, [queued('arrival'), queued('departure')]).view).toBe('stopping');
    expect(deriveStint({ ...stint, state: 'on-site' }, []).view).toBe('running');
    expect(deriveStint({ ...stint, state: 'on-site' }, [queued('departure')]).view).toBe('stopping');
    expect(deriveStint({ ...stint, state: 'left' }, [queued('departure')]).view).toBe('left');
    expect(
      deriveStint(stint, [queued('arrival', { attention: { code: 'reading.forbidden', message: 'No' } })]).view,
    ).toBe('attention');
  });

  test('projects unsynced unplanned starts as phantom stints and counts their local state', () => {
    const fleet: FieldMachine[] = [
      {
        id: ids.machine,
        code: 'JD-1',
        make: 'John Deere',
        model: '6140',
        categoryId: '5f1c2d3e-0001-4a00-8000-000000000007',
        categoryName: 'Tractors',
        categoryIcon: 'tractor',
        categoryColour: 'green',
        currentDriverUserId: null,
        currentDriverName: null,
        onSiteJobNumber: null,
      },
    ];
    const implementRows: FieldImplement[] = [
      {
        id: ids.implement,
        code: 'TIP-1',
        categoryId: '5f1c2d3e-0001-4a00-8000-000000000008',
        categoryName: 'Tip trailers',
        categoryIcon: 'tip-trailer',
        categoryColour: 'yellow',
        onSiteJobNumber: null,
      },
    ];
    const drivers: FieldDriver[] = [{ id: 'selected-driver', name: 'Selected Driver' }];
    const start = queued('arrival', {
      assignmentId: undefined,
      startAssignment: {
        localId: ids.stint,
        jobId: ids.job,
        implementId: ids.implement,
        driverUserId: 'selected-driver',
      },
    });
    expect(queuedUnplannedStints(ids.job, [start], fleet, implementRows, drivers)).toMatchObject([
      {
        id: ids.stint,
        machineCode: 'JD-1',
        implementCode: 'TIP-1',
        driverUserId: 'selected-driver',
        driverName: 'Selected Driver',
        view: 'starting',
      },
    ]);

    const job: FieldJob = {
      id: ids.job,
      code: 41,
      jobNumber: 'CJOB-00041',
      status: 'active',
      customerName: 'Scott',
      farmName: 'Scott Farm',
      workTypeName: 'Dam building',
      description: null,
      foremanUserId: 'foreman',
      stints: [],
    };
    expect(jobSummary({ ...job, status: 'upcoming' }, [start])).toEqual({
      machines: 1,
      running: 1,
      status: 'active',
      hasArrived: true,
    });
    expect(jobSummary(job, [start, queued('departure')])).toEqual({
      machines: 1,
      running: 0,
      status: 'active',
      hasArrived: true,
    });
  });

  test('projects queued planned-assignment overrides while the arrival is offline', () => {
    const arrival = queued('arrival', {
      stintOverrides: { implementId: ids.alternateImplement, driverUserId: 'selected-driver' },
    });

    expect(
      deriveStint(stint, [arrival], {
        implements: [
          {
            id: ids.alternateImplement,
            code: 'DISC-2',
            categoryId: '5f1c2d3e-0001-4a00-8000-000000000010',
            categoryName: 'Discs',
            categoryIcon: 'disc',
            categoryColour: 'yellow',
            onSiteJobNumber: null,
          },
        ],
        drivers: [{ id: 'selected-driver', name: 'Selected Driver' }],
      }),
    ).toMatchObject({
      implementId: ids.alternateImplement,
      implementCode: 'DISC-2',
      driverUserId: 'selected-driver',
      driverName: 'Selected Driver',
      view: 'starting',
    });
  });
});
