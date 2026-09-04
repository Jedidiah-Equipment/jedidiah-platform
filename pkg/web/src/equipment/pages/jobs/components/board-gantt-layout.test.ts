import type { UUID } from '@pkg/schema';
import type { ProjectedBayQueue } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { BAY_ROW_HEIGHT, createBoardGanttLayout, DEPARTMENT_HEADER_HEIGHT } from './board-gantt-layout.js';

describe('createBoardGanttLayout', () => {
  it('groups Bays beneath Department headings in pipeline order and preserves aligned row offsets', () => {
    const paint = buildBay('bay-paint', 'paint', 'Paint 1');
    const fabricationB = buildBay('bay-fab-b', 'fabrication', 'Fabrication 2');
    const procurement = buildBay('bay-procurement', 'procurement', 'Procurement 1');
    const fabricationA = buildBay('bay-fab-a', 'fabrication', 'Fabrication 1');

    const layout = createBoardGanttLayout([paint, fabricationB, procurement, fabricationA]);

    expect(
      layout.groups.map((group) => ({
        bayIds: group.bays.map((bay) => bay.id),
        department: group.department,
      })),
    ).toEqual([
      { bayIds: ['bay-fab-a', 'bay-fab-b'], department: 'fabrication' },
      { bayIds: ['bay-procurement'], department: 'procurement' },
      { bayIds: ['bay-paint'], department: 'paint' },
    ]);
    expect([...layout.bayTopById]).toEqual([
      ['bay-fab-a', DEPARTMENT_HEADER_HEIGHT],
      ['bay-fab-b', DEPARTMENT_HEADER_HEIGHT + BAY_ROW_HEIGHT],
      ['bay-procurement', DEPARTMENT_HEADER_HEIGHT * 2 + BAY_ROW_HEIGHT * 2],
      ['bay-paint', DEPARTMENT_HEADER_HEIGHT * 3 + BAY_ROW_HEIGHT * 3],
    ]);
    expect(layout.contentHeight).toBe(DEPARTMENT_HEADER_HEIGHT * 3 + BAY_ROW_HEIGHT * 4);
  });
});

function buildBay(id: string, department: ProjectedBayQueue['department'], name: string): ProjectedBayQueue {
  return {
    department,
    id: id as UUID,
    name,
  } as ProjectedBayQueue;
}
