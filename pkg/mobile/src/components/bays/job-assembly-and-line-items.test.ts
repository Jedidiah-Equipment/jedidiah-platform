import type { JobDetail } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { getJobAssemblyAndWorkRows } from './job-assembly-and-line-items';

describe('getJobAssemblyAndWorkRows', () => {
  it('shows name-only work items first in position order, followed by optional and standard assemblies', () => {
    const detail = {
      cfo: [
        { assemblyName: 'Standard chassis', kind: 'standard', parts: [] },
        { assemblyName: 'Heavy axle', kind: 'optional', parts: [] },
        { assemblyName: 'Standard hydraulics', kind: 'standard', parts: [] },
        { assemblyName: 'Toolbox', kind: 'optional', parts: [] },
      ],
      workRows: [
        { id: '00000000-0000-4000-8000-000000000101', name: 'Strip pump assembly' },
        { id: '00000000-0000-4000-8000-000000000102', name: 'Install replacement pump' },
      ],
    } satisfies Pick<JobDetail, 'cfo' | 'workRows'>;

    expect(getJobAssemblyAndWorkRows(detail)).toEqual([
      {
        key: 'custom-00000000-0000-4000-8000-000000000101',
        kind: 'custom',
        name: 'Strip pump assembly',
      },
      {
        key: 'custom-00000000-0000-4000-8000-000000000102',
        kind: 'custom',
        name: 'Install replacement pump',
      },
      { key: 'optional-Heavy axle', kind: 'optional', name: 'Heavy axle' },
      { key: 'optional-Toolbox', kind: 'optional', name: 'Toolbox' },
      { key: 'standard-Standard chassis', kind: 'standard', name: 'Standard chassis' },
      { key: 'standard-Standard hydraulics', kind: 'standard', name: 'Standard hydraulics' },
    ]);
  });

  it('keeps product Quote line items as the same custom rows', () => {
    expect(
      getJobAssemblyAndWorkRows({
        cfo: [],
        workRows: [
          { id: '00000000-0000-4000-8000-000000000201', name: 'Custom hydraulic hose' },
          { id: '00000000-0000-4000-8000-000000000202', name: 'Commissioning' },
        ],
      }),
    ).toEqual([
      {
        key: 'custom-00000000-0000-4000-8000-000000000201',
        kind: 'custom',
        name: 'Custom hydraulic hose',
      },
      {
        key: 'custom-00000000-0000-4000-8000-000000000202',
        kind: 'custom',
        name: 'Commissioning',
      },
    ]);
  });
});
