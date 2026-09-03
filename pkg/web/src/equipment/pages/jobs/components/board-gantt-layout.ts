import { type BayDepartmentGroup, groupBaysByDepartmentPipeline } from '@pkg/domain';
import type { ProjectedBayQueue, UUID } from '@pkg/schema';

import { sortBaysByDepartmentPipeline } from '@/components/bays/sort-bays.js';

// Department headings are deliberately shorter than Bay lanes so they read as labels, not empty Bays.
export const DEPARTMENT_HEADER_HEIGHT = 32;
export const BAY_ROW_HEIGHT = 72;

export type BoardGanttDepartmentGroup = BayDepartmentGroup<ProjectedBayQueue>;

export type BoardGanttLayout = {
  bayTopById: ReadonlyMap<UUID, number>;
  contentHeight: number;
  groups: BoardGanttDepartmentGroup[];
};

export function createBoardGanttLayout(bays: ProjectedBayQueue[]): BoardGanttLayout {
  const groups = groupBaysByDepartmentPipeline(sortBaysByDepartmentPipeline(bays));
  const bayTopById = new Map<UUID, number>();
  let top = 0;

  for (const group of groups) {
    top += DEPARTMENT_HEADER_HEIGHT;

    for (const bay of group.bays) {
      bayTopById.set(bay.id, top);
      top += BAY_ROW_HEIGHT;
    }
  }

  return { bayTopById, contentHeight: top, groups };
}
