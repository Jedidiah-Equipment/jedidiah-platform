import { JOB_DEPARTMENT_PIPELINE } from '@pkg/domain';
import type { Department } from '@pkg/schema';

import type { BayListCard } from './use-bay-list';
import { createLiteralGuard } from './use-persisted-state';

/** Client-side ordering for the Bay grid: by the active Job's days-left, or by Bay name. */
export type BaySort = 'days-left' | 'name';

export const isBaySort = createLiteralGuard(['days-left', 'name']);

/** Matches every fact rendered on the compact Plan row. */
export function filterBayCards(cards: readonly BayListCard[], search: string): BayListCard[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return [...cards];

  return cards.filter((bay) => {
    const facts = [
      bay.name,
      bay.operator?.name,
      bay.active?.jobCode,
      bay.active?.jobDisplayName,
      bay.active?.customerCompanyName ?? (bay.active ? 'Stock' : null),
    ];

    return facts.some((fact) => fact?.toLocaleLowerCase().includes(query));
  });
}

/**
 * Orders the Bay cards client-side. 'days-left' surfaces the most urgent active Jobs first
 * (fewest working days remaining); idle Bays have no countdown, so they sort by name after
 * the active ones. 'name' is a plain alphabetical Bay order. Returns a new array.
 */
export function sortBayCards(cards: readonly BayListCard[], sort: BaySort): BayListCard[] {
  const byName = (left: BayListCard, right: BayListCard) => left.name.localeCompare(right.name);

  if (sort === 'name') {
    return [...cards].sort(byName);
  }

  return [...cards].sort((left, right) => {
    if (left.active === null || right.active === null) {
      // Both idle keeps the name order; otherwise the idle Bay sorts last.
      if (left.active === right.active) return byName(left, right);

      return left.active === null ? 1 : -1;
    }

    return left.active.remainingWorkDays - right.active.remainingWorkDays || byName(left, right);
  });
}

export type BayDepartmentGroup = {
  bays: BayListCard[];
  department: Department;
};

const departmentOrder = new Map(JOB_DEPARTMENT_PIPELINE.map((step, index) => [step.department, index] as const));

/**
 * Splits the Bay cards into the Board's Department headings — the fixed visual pipeline the web Gantt
 * already reads top to bottom. Ordering within a heading is whatever the caller handed in, so the sort
 * control keeps deciding it; Departments with no matching Bay get no heading.
 */
export function groupBayCardsByDepartment(cards: readonly BayListCard[]): BayDepartmentGroup[] {
  // A stable sort by Department alone leaves each Department's Bays in the caller's order, and lands
  // any Department outside the pipeline in one trailing group rather than dropping its Bays.
  const ordered = [...cards].sort(
    (left, right) =>
      (departmentOrder.get(left.department) ?? Number.MAX_SAFE_INTEGER) -
      (departmentOrder.get(right.department) ?? Number.MAX_SAFE_INTEGER),
  );

  return ordered.reduce<BayDepartmentGroup[]>((groups, bay) => {
    const group = groups.at(-1);

    if (group?.department === bay.department) group.bays.push(bay);
    else groups.push({ bays: [bay], department: bay.department });

    return groups;
  }, []);
}
