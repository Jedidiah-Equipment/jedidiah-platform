import { createHelpTopicResolver } from '@/lib/help-topics.js';

export const helpTopicForPath = createHelpTopicResolver(
  [
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
    ['/equipment/labor-rates', 'laborRates'],
    ['/equipment/part-categories', 'partCategories'],
    ['/equipment/parts', 'parts'],
    ['/equipment/products', 'products'],
    ['/equipment/purchase-orders', 'purchaseOrders'],
    ['/equipment/quotes', 'quotes'],
    ['/equipment/suppliers', 'suppliers'],
    ['/equipment/units', 'units'],
    ['/equipment/users', 'users'],
  ],
  'home',
);
