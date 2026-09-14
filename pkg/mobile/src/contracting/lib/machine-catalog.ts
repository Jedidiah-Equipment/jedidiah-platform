import type { Machine } from '@pkg/schema/contracting';
import { createLiteralGuard } from '@/lib/use-persisted-state';

export type MachineSort = 'code' | 'category';
export const isMachineSort = createLiteralGuard(['code', 'category']);

export function isMachineCategoryFilter(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

type MachineListItem = Pick<Machine, 'id' | 'code' | 'make' | 'model' | 'categoryId' | 'categoryName'>;

export function getMachineCategories(machines: readonly MachineListItem[]) {
  return [
    ...new Map(
      machines.map((machine) => [
        machine.categoryId,
        {
          value: machine.categoryId,
          label: machine.categoryName,
        },
      ]),
    ).values(),
  ].sort((a, b) => compareNames(a.label, b.label));
}

export function normalizeMachineCategory(category: string, availableIds: readonly string[]) {
  return category === 'all' || availableIds.includes(category) ? category : 'all';
}

/** Filter and sort the complete saved fleet so these controls also work offline. */
export function getVisibleMachines<T extends MachineListItem>(
  machines: readonly T[],
  { search, category, sort }: { search: string; category: string; sort: MachineSort },
): T[] {
  const term = search.trim().toLowerCase();
  return machines
    .filter(
      (machine) =>
        (category === 'all' || machine.categoryId === category) &&
        [machine.code, machine.make, machine.model].some((value) => value?.toLowerCase().includes(term)),
    )
    .sort(
      (a, b) =>
        (sort === 'category' ? compareNames(a.categoryName, b.categoryName) : 0) ||
        compareNames(a.code, b.code) ||
        a.id.localeCompare(b.id),
    );
}

function compareNames(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}
