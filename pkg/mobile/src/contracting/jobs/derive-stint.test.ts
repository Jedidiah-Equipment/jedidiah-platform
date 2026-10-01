import { DateIso } from '@pkg/schema';
import type { FieldJob, FieldStint } from '@pkg/schema/contracting';
import { expect, test } from 'vitest';
import { deriveStint, jobSummary } from './derive-stint';

const stint: FieldStint = {
  id: '5f1c2d3e-0001-4a00-8000-000000000002',
  jobId: '5f1c2d3e-0001-4a00-8000-000000000001',
  machineId: '5f1c2d3e-0001-4a00-8000-000000000003',
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

test('a stint shows its served state and a Job counts the stints on site', () => {
  expect(deriveStint(stint).view).toBe('planned');
  expect(deriveStint({ ...stint, state: 'on-site' }).view).toBe('running');
  expect(deriveStint({ ...stint, state: 'left' }).view).toBe('left');

  const job: FieldJob = {
    id: stint.jobId,
    code: 41,
    jobNumber: 'CJOB-00041',
    status: 'active',
    customerName: 'Scott',
    farmName: 'Scott Farm',
    workTypeName: 'Dam building',
    description: null,
    foremanUserId: 'foreman',
    stints: [stint, { ...stint, id: 'on-site', state: 'on-site' }, { ...stint, id: 'left', state: 'left' }],
  };
  expect(jobSummary(job)).toEqual({ machines: 3, running: 1, status: 'active', hasArrived: true });
});
