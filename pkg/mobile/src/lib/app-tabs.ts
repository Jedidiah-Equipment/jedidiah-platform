import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';

export type AppTab = 'jobs' | 'plan' | 'quotes' | 'products' | 'units' | 'stores';

export function visibleTabs(access: UserAccessSummary | null | undefined): AppTab[] {
  const tabs: AppTab[] = [];

  if (hasPermission(access, 'job:read')) tabs.push('jobs', 'plan');
  if (hasPermission(access, 'quote:read')) tabs.push('quotes');
  if (hasPermission(access, 'product:read')) tabs.push('products');
  if (hasPermission(access, 'product_unit:read')) tabs.push('units');
  // Keyed on the right to *move* stock rather than to read it: the tab is the physical-flow surface
  // (spec §10), and a reader with no `inventory:move` would find every action on it disabled.
  if (hasPermission(access, 'inventory:move')) tabs.push('stores');

  return tabs;
}

export function showTabBar(tabs: AppTab[]): boolean {
  return tabs.length > 1;
}

export function appTabHref(tab: AppTab): '/jobs' | '/plan' | '/products' | '/quotes' | '/stores' | '/units' {
  const hrefs = {
    jobs: '/jobs',
    plan: '/plan',
    products: '/products',
    quotes: '/quotes',
    stores: '/stores',
    units: '/units',
  } as const satisfies Record<AppTab, string>;

  return hrefs[tab];
}

const TAB_LABELS = {
  jobs: 'JOBS',
  plan: 'PLAN',
  products: 'PRODUCTS',
  quotes: 'QUOTES',
  stores: 'STORES',
  units: 'UNITS',
} as const satisfies Record<AppTab, string>;

export function appTabLabel(tab: AppTab): string {
  return TAB_LABELS[tab];
}

// The route directly under the `(tabs)` group, so Plan carries its route-group parentheses.
const TAB_ROUTE_SEGMENTS = {
  jobs: 'jobs',
  plan: '(plan)',
  products: 'products',
  quotes: 'quotes',
  stores: 'stores',
  units: 'units',
} as const satisfies Record<AppTab, string>;

/**
 * The tab owning the current route, read from Expo Router segments. Keyed on the segment
 * below `(tabs)` rather than the pathname so a Bay schedule still counts as Plan.
 */
export function activeAppTab(segments: readonly string[]): AppTab | null {
  const groupIndex = segments.indexOf('(tabs)');
  const segment = groupIndex === -1 ? undefined : segments[groupIndex + 1];
  const tab = (Object.keys(TAB_ROUTE_SEGMENTS) as AppTab[]).find((key) => TAB_ROUTE_SEGMENTS[key] === segment);

  return tab ?? null;
}
