import type { AppEnv } from '@pkg/schema';
// This package has no internal alias, and self-importing @pkg/domain/shared would target build output.
// biome-ignore lint/style/noRestrictedImports: Keep the source dependency direct during package compilation.
import { isRemoteAppEnv } from '../../environment.js';

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

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

/**
 * The docs origin an app builds Help links from, or `null` when it should offer no Help at all.
 *
 * The docs site is optional: with none configured there is nothing useful to open, so the apps drop
 * the affordance rather than show a link that goes nowhere. A loopback origin counts only in
 * development — every runtime package ships a committed `.env` of local defaults, so a deployed
 * service missing the variable would otherwise inherit one and send a shared tablet to itself.
 */
export function resolveDocsOrigin(value: string | null | undefined, appEnv: AppEnv): string | null {
  const origin = value?.replace(/\/+$/, '');

  if (!origin) {
    return null;
  }

  return isRemoteAppEnv(appEnv) && isLoopbackOrigin(origin) ? null : origin;
}

// Hand-parsed rather than via `URL`: this package stays browser-safe and compiles without DOM types.
function isLoopbackOrigin(origin: string): boolean {
  const authority = origin.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0] ?? '';

  return LOOPBACK_HOSTS.includes(authority) || LOOPBACK_HOSTS.includes(authority.replace(/:\d+$/, ''));
}
