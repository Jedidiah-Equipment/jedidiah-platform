import { productUnitBuildStateLabels } from '@pkg/domain';
import { ProductUnitDisplayBuildState } from '@pkg/schema';

/** The Build dropdown offers exactly the states the list displays, plus the unfiltered choice. */
export type UnitBuildStateFilter = 'all' | ProductUnitDisplayBuildState;
export type UnitSort = 'serial' | 'product';

type UnitControlOption<Value extends string> = { label: string; value: Value };

export const UNIT_BUILD_STATE_OPTIONS: readonly UnitControlOption<UnitBuildStateFilter>[] = [
  { label: 'All build states', value: 'all' },
  ...ProductUnitDisplayBuildState.options.map((state) => ({
    label: productUnitBuildStateLabels[state],
    value: state,
  })),
];

export const UNIT_SORT_OPTIONS: readonly UnitControlOption<UnitSort>[] = [
  { label: 'Serial', value: 'serial' },
  { label: 'Product name', value: 'product' },
];

export function isUnitBuildStateFilter(value: unknown): value is UnitBuildStateFilter {
  return value === 'all' || ProductUnitDisplayBuildState.safeParse(value).success;
}

export function isUnitSort(value: unknown): value is UnitSort {
  return value === 'serial' || value === 'product';
}

export function getUnitListPresentation(buildState: UnitBuildStateFilter, sort: UnitSort) {
  return {
    columnFilters: buildState === 'all' ? {} : { buildState },
    sortBy: sort === 'product' ? ('productName' as const) : ('productSerialNumber' as const),
    sortDirection: 'asc' as const,
  };
}
