import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';

export type AppTab = 'schedule' | 'stores' | 'quotes' | 'products' | 'units';

export function visibleTabs(access: UserAccessSummary | null | undefined): AppTab[] {
  const tabs: AppTab[] = [];

  if (hasPermission(access, 'job:read')) tabs.push('schedule');
  // Keyed on the right to *move* stock rather than to read it: the tab is the physical-flow surface
  // (spec §10), and a reader with no `inventory:move` would find every action on it disabled.
  if (hasPermission(access, 'inventory:move')) tabs.push('stores');
  if (hasPermission(access, 'quote:read')) tabs.push('quotes');
  if (hasPermission(access, 'product:read')) tabs.push('products');
  if (hasPermission(access, 'product_unit:read')) tabs.push('units');

  return tabs;
}

export function showTabBar(tabs: AppTab[]): boolean {
  return tabs.length > 1;
}
