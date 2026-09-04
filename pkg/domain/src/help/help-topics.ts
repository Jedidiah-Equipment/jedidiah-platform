/**
 * The docs path each app area sends its Help affordance to, keyed by topic.
 *
 * An area whose workflow has no page written yet points at the docs landing page, so every entry
 * always names a page that exists — a test in `@pkg/docs` walks these paths and fails when one does
 * not resolve, which is what stops a renamed doc from breaking Help on a tablet instead of under
 * `pnpm verify`. Repoint an entry in the same PR that writes its page.
 */
export const HELP_TOPICS = {
  bays: '/production/delete-a-bay',
  customers: '/sales/remove-a-customer',
  home: '/',
  inventory: '/inventory/stock-on-hand-and-free-stock',
  inventoryBuyList: '/inventory/raise-purchase-orders-from-the-buy-list',
  inventoryCloseOut: '/inventory/close-out-a-job',
  inventoryEstimatedStock: '/inventory/estimated-stock-on-hand',
  inventoryJobVariance: '/inventory/read-a-jobs-material-variance',
  inventoryPriceVariance: '/inventory/cross-check-a-supplier-invoice',
  inventoryStocktake: '/inventory/run-a-stocktake-session',
  jobActivity: '/production/catch-up-on-job-activity',
  jobDepartmentTimes: '/production/stamp-fabrication-times',
  jobs: '/production/find-a-job',
  parts: '/inventory/export-and-import-parts',
  partLabels: '/inventory/print-part-labels',
  plan: '/production/open-a-bay-plan',
  products: '/inventory/maintain-a-product-cost-estimate',
  productBuildTimes: '/production/read-product-build-times',
  purchaseOrders: '/inventory/approve-a-purchase-order',
  quotes: '/sales/cancel-a-quote',
  storesTablet: '/inventory/work-the-stores-tablet',
  suppliers: '/inventory/maintain-suppliers',
  supplierMerge: '/inventory/merge-duplicate-suppliers',
  unitReassignment: '/sales/reassign-a-unit',
  units: '/production/remove-a-unit',
} as const satisfies Record<string, string>;

export type HelpTopic = keyof typeof HELP_TOPICS;

/** The absolute URL of a topic's page on the docs site running at `docsOrigin`. */
export function helpUrl(docsOrigin: string, topic: HelpTopic): string {
  return `${docsOrigin.replace(/\/+$/, '')}${HELP_TOPICS[topic]}`;
}
