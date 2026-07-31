import { productUnitBuildStateLabels } from '@pkg/domain';
import { ProductUnitDisplayBuildState } from '@pkg/schema';

import type { ListControlOption } from '@/components/ListControls';

import { createLiteralGuard } from './use-persisted-state';

/** The Build dropdown offers exactly the states the list displays, plus the unfiltered choice. */
export type UnitBuildStateFilter = 'all' | ProductUnitDisplayBuildState;
export type UnitSort = 'serial' | 'product';

export const UNIT_BUILD_STATE_OPTIONS: readonly ListControlOption<UnitBuildStateFilter>[] = [
  { label: 'All build states', value: 'all' },
  ...ProductUnitDisplayBuildState.options.map((state) => ({
    label: productUnitBuildStateLabels[state],
    value: state,
  })),
];

export const UNIT_SORT_OPTIONS: readonly ListControlOption<UnitSort>[] = [
  { label: 'Serial', value: 'serial' },
  { label: 'Product name', value: 'product' },
];

export function isUnitBuildStateFilter(value: unknown): value is UnitBuildStateFilter {
  return value === 'all' || ProductUnitDisplayBuildState.safeParse(value).success;
}

export const isUnitSort = createLiteralGuard(['serial', 'product']);

export function getUnitListPresentation(buildState: UnitBuildStateFilter, sort: UnitSort) {
  return {
    columnFilters: buildState === 'all' ? {} : { buildState },
    sortBy: sort === 'product' ? ('productName' as const) : ('productSerialNumber' as const),
    sortDirection: 'asc' as const,
  };
}
