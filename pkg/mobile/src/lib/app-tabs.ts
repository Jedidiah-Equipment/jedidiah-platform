import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';

export type AppTab = 'schedule' | 'products';

export function visibleTabs(access: UserAccessSummary | null | undefined): AppTab[] {
  const tabs: AppTab[] = ['schedule'];

  if (hasPermission(access, 'product:read')) tabs.push('products');

  return tabs;
}

export function showTabBar(tabs: AppTab[]): boolean {
  return tabs.length > 1;
}
