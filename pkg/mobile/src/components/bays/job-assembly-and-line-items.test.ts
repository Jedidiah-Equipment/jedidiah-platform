import type { JobDetail } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { getJobAssemblyAndLineItemRows } from './job-assembly-and-line-items';

describe('getJobAssemblyAndLineItemRows', () => {
  it('shows custom line items first, followed by optional and standard assemblies', () => {
    const detail = {
      cfo: [
        { assemblyName: 'Standard chassis', kind: 'standard', parts: [] },
        { assemblyName: 'Heavy axle', kind: 'optional', parts: [] },
        { assemblyName: 'Standard hydraulics', kind: 'standard', parts: [] },
        { assemblyName: 'Toolbox', kind: 'optional', parts: [] },
      ],
      lineItems: [
        { id: '00000000-0000-4000-8000-000000000101', name: 'Custom hydraulic hose' },
        { id: '00000000-0000-4000-8000-000000000102', name: 'Commissioning' },
      ],
    } satisfies Pick<JobDetail, 'cfo' | 'lineItems'>;

    expect(getJobAssemblyAndLineItemRows(detail)).toEqual([
      {
        key: 'custom-00000000-0000-4000-8000-000000000101',
        kind: 'custom',
        name: 'Custom hydraulic hose',
      },
      {
        key: 'custom-00000000-0000-4000-8000-000000000102',
        kind: 'custom',
        name: 'Commissioning',
      },
      { key: 'optional-Heavy axle', kind: 'optional', name: 'Heavy axle' },
      { key: 'optional-Toolbox', kind: 'optional', name: 'Toolbox' },
      { key: 'standard-Standard chassis', kind: 'standard', name: 'Standard chassis' },
      { key: 'standard-Standard hydraulics', kind: 'standard', name: 'Standard hydraulics' },
    ]);
  });
});
