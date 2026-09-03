import type { HelpTopic } from '@pkg/domain';

/**
 * Which docs topic a screen belongs to, by route prefix. Deliberately coarse: an area gets one
 * topic and its detail routes inherit it. Order here does not matter — the longest matching prefix
 * wins, so a route nested under another area (`/equipment/inventory/close-out`) beats the area it sits in.
 */
const TOPIC_ROUTES: ReadonlyArray<readonly [prefix: string, topic: HelpTopic]> = [
  ['/equipment/bays', 'bays'],
  ['/equipment/customers', 'customers'],
  ['/equipment/inventory', 'inventory'],
  ['/equipment/inventory/buy-list', 'inventoryBuyList'],
  ['/equipment/inventory/close-out', 'inventoryCloseOut'],
  ['/equipment/inventory/job-variance', 'inventoryJobVariance'],
  ['/equipment/inventory/price-variance', 'inventoryPriceVariance'],
  ['/equipment/inventory/stocktake', 'inventoryStocktake'],
  ['/equipment/jobs', 'jobs'],
  ['/equipment/jobs/activity', 'jobActivity'],
  ['/equipment/parts', 'parts'],
  ['/equipment/products', 'products'],
  ['/equipment/purchase-orders', 'purchaseOrders'],
  ['/equipment/quotes', 'quotes'],
  ['/equipment/suppliers', 'suppliers'],
  ['/equipment/units', 'units'],
];

const byLongestPrefix = [...TOPIC_ROUTES].sort(([a], [b]) => b.length - a.length);

export function helpTopicForPath(pathname: string): HelpTopic {
  const match = byLongestPrefix.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  return match?.[1] ?? 'home';
}
