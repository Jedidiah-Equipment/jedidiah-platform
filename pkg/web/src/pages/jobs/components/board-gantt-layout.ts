import type { Department, ProjectedBayQueue, UUID } from '@pkg/schema';

import { sortBaysByDepartmentPipeline } from '@/components/bays/sort-bays.js';

// Department headings are deliberately shorter than Bay lanes so they read as labels, not empty Bays.
export const DEPARTMENT_HEADER_HEIGHT = 32;
export const BAY_ROW_HEIGHT = 72;

export type BoardGanttDepartmentGroup = {
  bays: ProjectedBayQueue[];
  department: Department;
};

export type BoardGanttLayout = {
  bayTopById: ReadonlyMap<UUID, number>;
  contentHeight: number;
  groups: BoardGanttDepartmentGroup[];
};

export function createBoardGanttLayout(bays: ProjectedBayQueue[]): BoardGanttLayout {
  const groups: BoardGanttDepartmentGroup[] = [];
  const bayTopById = new Map<UUID, number>();
  let top = 0;

  for (const bay of sortBaysByDepartmentPipeline(bays)) {
    let group = groups.at(-1);

    if (group?.department !== bay.department) {
      group = { bays: [], department: bay.department };
      groups.push(group);
      top += DEPARTMENT_HEADER_HEIGHT;
    }

    group.bays.push(bay);
    bayTopById.set(bay.id, top);
    top += BAY_ROW_HEIGHT;
  }

  return { bayTopById, contentHeight: top, groups };
}
