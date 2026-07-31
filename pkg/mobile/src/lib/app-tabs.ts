import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';

export type AppTab = 'schedule' | 'quotes' | 'products' | 'units';

export function visibleTabs(access: UserAccessSummary | null | undefined): AppTab[] {
  const tabs: AppTab[] = [];

  if (hasPermission(access, 'job:read')) tabs.push('schedule');
  if (hasPermission(access, 'quote:read')) tabs.push('quotes');
  if (hasPermission(access, 'product:read')) tabs.push('products');
  if (hasPermission(access, 'product_unit:read')) tabs.push('units');

  return tabs;
}

export function showTabBar(tabs: AppTab[]): boolean {
  return tabs.length > 1;
}
