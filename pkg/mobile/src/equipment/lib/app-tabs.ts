import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';

import { MAIN_TAB_PARENTS, type MainTabParent } from '@/equipment/lib/toolbar-navigation';

export type AppTab = 'activity' | 'jobs' | 'plan' | 'quotes' | 'products' | 'units' | 'stores';

export function visibleTabs(access: UserAccessSummary | null | undefined): AppTab[] {
  const tabs: AppTab[] = [];

  if (hasPermission(access, 'equipment_job:read')) tabs.push('activity', 'jobs', 'plan');
  if (hasPermission(access, 'equipment_quote:read')) tabs.push('quotes');
  if (hasPermission(access, 'equipment_product:read')) tabs.push('products');
  if (hasPermission(access, 'equipment_product_unit:read')) tabs.push('units');
  // Keyed on the right to *move* stock rather than to read it: the tab is the physical-flow surface
  // (spec §10), and a reader with no `equipment_inventory:move` would find every action on it disabled.
  if (hasPermission(access, 'equipment_inventory:move')) tabs.push('stores');

  return tabs;
}

export function showTabBar(tabs: AppTab[]): boolean {
  return tabs.length > 1;
}

export function appTabHref(tab: AppTab): MainTabParent['href'] {
  return MAIN_TAB_PARENTS[tab].href;
}

export function appTabLabel(tab: AppTab): string {
  return MAIN_TAB_PARENTS[tab].label.toUpperCase();
}

// The route directly under the `(tabs)` group, so Plan carries its route-group parentheses.
const TAB_ROUTE_SEGMENTS = {
  activity: 'activity',
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
