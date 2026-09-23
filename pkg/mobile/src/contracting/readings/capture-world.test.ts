import { onSiteElsewhere } from '@pkg/domain/contracting';
import { DateIso } from '@pkg/schema';
import type { FieldImplement, FieldJob, FieldMachine, FieldStint } from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import { captureWorld } from './capture-world';
import type { QueuedReading } from './reading-queue';

const ids = {
  job: '5f1c2d3e-0002-4a00-8000-000000000001',
  otherJob: '5f1c2d3e-0002-4a00-8000-000000000002',
  stint: '5f1c2d3e-0002-4a00-8000-000000000003',
  tractor: '5f1c2d3e-0002-4a00-8000-000000000004',
  digger: '5f1c2d3e-0002-4a00-8000-000000000005',
  disc: '5f1c2d3e-0002-4a00-8000-000000000006',
  start: '5f1c2d3e-0002-4a00-8000-000000000007',
};

const stint = (overrides: Partial<FieldStint> = {}): FieldStint => ({
  id: ids.stint,
  jobId: ids.job,
  machineId: ids.tractor,
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
  ...overrides,
});
const job = (stints: FieldStint[], id = ids.job, jobNumber = 'CJOB-00041'): FieldJob => ({
  id,
  code: 41,
  jobNumber,
  status: 'active',
  customerName: 'Scott',
  farmName: 'Scott Farm',
  workTypeName: 'Dam building',
  description: null,
  foremanUserId: 'foreman',
  stints,
});
const queued = (overrides: Partial<QueuedReading>): QueuedReading => ({
  localId: '5f1c2d3e-0002-4a00-8000-0000000000aa',
  machineId: ids.tractor,
  role: 'spot',
  value: 100,
  capturedAt: '2026-09-17T07:00:00.000Z',
  disputePrevious: false,
  photoLocalUri: null,
  ...overrides,
});
const machine = (id: string, onSiteJobNumber: string | null): FieldMachine => ({ id, onSiteJobNumber }) as FieldMachine;
const implement = (id: string, onSiteJobNumber: string | null): FieldImplement =>
  ({ id, onSiteJobNumber }) as FieldImplement;

const base = {
  machineId: ids.tractor,
  stintId: null,
  queued: [] as QueuedReading[],
  history: [],
  jobs: [] as FieldJob[],
  fleet: [] as FieldMachine[],
  implementRows: [] as FieldImplement[],
  management: false,
  hasPhoto: true,
};

describe('captureWorld', () => {
  test('takes the latest reading from the queue when it is newer than the served history', () => {
    const history = [{ id: 'server-1', value: 120, capturedAt: DateIso.parse('2026-09-17T06:00:00.000Z') }];
    expect(captureWorld({ ...base, history }).latest).toEqual({ id: 'server-1', value: 120 });
    const newer = queued({ localId: 'local-1', value: 130, capturedAt: '2026-09-17T08:00:00.000Z' });
    expect(captureWorld({ ...base, history, queued: [newer] }).latest).toEqual({ id: 'local-1', value: 130 });
  });

  test('believes a planned stint with a queued arrival is on site, and one with a queued departure has left', () => {
    const jobs = [job([stint()])];
    const arrival = queued({ role: 'arrival', assignmentId: ids.stint, localId: 'arrival' });
    const departure = queued({ role: 'departure', assignmentId: ids.stint, localId: 'departure' });
    expect(captureWorld({ ...base, jobs, stintId: ids.stint, queued: [arrival] }).stint).toBe('on-site');
    expect(captureWorld({ ...base, jobs, stintId: ids.stint, queued: [arrival, departure] }).stint).toBe('left');
  });

  test('counts a stint started offline as on site on its Job', () => {
    const start = queued({
      role: 'arrival',
      machineId: ids.digger,
      startAssignment: { jobId: ids.otherJob, localId: ids.start, implementId: ids.disc },
    });
    const world = captureWorld({ ...base, jobs: [job([], ids.otherJob, 'CJOB-00007')], queued: [start] });
    expect(world.onSite).toEqual([{ machineId: ids.digger, implementId: ids.disc, jobNumber: 'CJOB-00007' }]);
    expect(captureWorld({ ...base, queued: [start], stintId: ids.start }).stint).toBe('on-site');
  });

  test('believes the state the opening screen showed for a stint the phone has not cached', () => {
    expect(captureWorld({ ...base, stintId: ids.stint, unresolvedStint: 'on-site' }).stint).toBe('on-site');
    expect(captureWorld({ ...base, stintId: null, unresolvedStint: 'on-site' }).stint).toBeNull();
  });

  test('frees a Machine and its Implement once their departure is queued, whatever the server last said', () => {
    const onSite = stint({ state: 'on-site', implementId: ids.disc });
    const departure = queued({ role: 'departure', assignmentId: ids.stint });
    const world = captureWorld({
      ...base,
      jobs: [job([onSite])],
      fleet: [machine(ids.tractor, 'CJOB-00041')],
      implementRows: [implement(ids.disc, 'CJOB-00041')],
      queued: [departure],
    });
    expect(world.onSite).toEqual([]);
  });

  test('fills in what the server says is on site only where nothing on the phone knows better', () => {
    const world = captureWorld({
      ...base,
      jobs: [job([stint({ state: 'on-site' })])],
      fleet: [machine(ids.tractor, 'CJOB-00099'), machine(ids.digger, 'CJOB-00007')],
      implementRows: [implement(ids.disc, 'CJOB-00007')],
    });
    expect(world.onSite).toEqual([
      { machineId: ids.tractor, implementId: null, jobNumber: 'CJOB-00041' },
      { machineId: ids.digger, implementId: null, jobNumber: 'CJOB-00007' },
      { machineId: null, implementId: ids.disc, jobNumber: 'CJOB-00007' },
    ]);
  });
});

describe('onSiteElsewhere over the phone’s world', () => {
  test('names the Job a Machine or Implement is on, as the capture rules judge it', () => {
    const world = captureWorld({
      ...base,
      fleet: [machine(ids.digger, 'CJOB-00007')],
      implementRows: [implement(ids.disc, 'CJOB-00008')],
    });
    expect(onSiteElsewhere(world, { machineId: ids.digger })).toEqual({
      rule: 'machine-busy',
      jobNumber: 'CJOB-00007',
    });
    expect(onSiteElsewhere(world, { implementId: ids.disc })).toEqual({
      rule: 'implement-busy',
      jobNumber: 'CJOB-00008',
    });
    expect(onSiteElsewhere(world, { machineId: ids.tractor })).toBeNull();
  });
});
