import { Bay } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { sortBaysByDepartmentPipeline } from './sort-bays.js';

describe('sortBaysByDepartmentPipeline', () => {
  it('does not mutate the input array', () => {
    const bays = [
      buildBay({ department: 'paint', name: 'Paint Bay 1' }),
      buildBay({ department: 'procurement', name: 'Procurement Bay 1' }),
    ];

    sortBaysByDepartmentPipeline(bays);

    expect(bays.map((bay) => bay.department)).toEqual(['paint', 'procurement']);
  });
});

let bayCounter = 0;

function buildBay({ department, name }: { department: Bay['department']; name: string }): Bay {
  bayCounter += 1;

  return Bay.parse({
    createdAt: '2026-01-01T00:00:00.000Z',
    department,
    disabledAt: null,
    id: `550e8400-e29b-41d4-a716-4466554400${String(bayCounter).padStart(2, '0')}`,
    name,
    scheduleOrigin: '2026-01-01',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}
