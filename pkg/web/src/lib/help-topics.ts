import type { HelpTopic } from '@pkg/domain';

/**
 * Which docs topic a screen belongs to, by route prefix. Deliberately coarse: an area gets one
 * topic and its detail routes inherit it. Order here does not matter — the longest matching prefix
 * wins, so a route nested under another area (`/inventory/close-out`) beats the area it sits in.
 */
const TOPIC_ROUTES: ReadonlyArray<readonly [prefix: string, topic: HelpTopic]> = [
  ['/bays', 'bays'],
  ['/customers', 'customers'],
  ['/inventory', 'inventory'],
  ['/inventory/buy-list', 'inventoryBuyList'],
  ['/inventory/close-out', 'inventoryCloseOut'],
  ['/inventory/job-variance', 'inventoryJobVariance'],
  ['/inventory/price-variance', 'inventoryPriceVariance'],
  ['/inventory/stocktake', 'inventoryStocktake'],
  ['/jobs', 'jobs'],
  ['/jobs/activity', 'jobActivity'],
  ['/parts', 'parts'],
  ['/products', 'products'],
  ['/purchase-orders', 'purchaseOrders'],
  ['/quotes', 'quotes'],
  ['/suppliers', 'suppliers'],
  ['/units', 'units'],
];

const byLongestPrefix = [...TOPIC_ROUTES].sort(([a], [b]) => b.length - a.length);

export function helpTopicForPath(pathname: string): HelpTopic {
  const match = byLongestPrefix.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  return match?.[1] ?? 'home';
}
