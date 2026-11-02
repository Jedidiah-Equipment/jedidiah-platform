import type { Href } from 'expo-router';

import type { AppTab } from '@/equipment/lib/app-tabs';

/** The one table of main tab roots; `appTabHref` and `appTabLabel` read it rather than repeating the routes. */
export const MAIN_TAB_PARENTS = {
  activity: { href: '/equipment/activity', label: 'Activity' },
  jobs: { href: '/equipment/jobs', label: 'Jobs' },
  plan: { href: '/equipment/plan', label: 'Plan' },
  products: { href: '/equipment/products', label: 'Products' },
  quotes: { href: '/equipment/quotes', label: 'Quotes' },
  stores: { href: '/equipment/stores', label: 'Stores' },
  units: { href: '/equipment/units', label: 'Units' },
} as const satisfies Record<AppTab, { href: Href; label: string }>;

export type MainTabParent = (typeof MAIN_TAB_PARENTS)[keyof typeof MAIN_TAB_PARENTS];

/** Modal deep links have no invoking tab, so Jobs is the stable signed-in fallback. */
export function resolveAssistantParent(href: string | undefined): MainTabParent {
  return Object.values(MAIN_TAB_PARENTS).find((parent) => parent.href === href) ?? MAIN_TAB_PARENTS.jobs;
}

export type DocumentParent = {
  id: string;
  kind: 'job' | 'product' | 'quote';
  returnTo: Href;
};

export function resolveDocumentParent({
  jobId,
  productId,
  quoteId,
}: {
  jobId?: string;
  productId?: string;
  quoteId?: string;
}): DocumentParent | null {
  if (productId) {
    return {
      id: productId,
      kind: 'product',
      returnTo: { pathname: '/equipment/products/[productId]', params: { productId } },
    };
  }
  if (jobId) {
    return {
      id: jobId,
      kind: 'job',
      returnTo: { pathname: '/equipment/jobs/[jobId]', params: { jobId } },
    };
  }
  if (quoteId) {
    return {
      id: quoteId,
      kind: 'quote',
      returnTo: { pathname: '/equipment/quotes/[quoteId]', params: { quoteId } },
    };
  }
  return null;
}

/** Where a stores movement returns: the close-out Job it was reached from, else its Part. */
export function storesMovementReturnTo({ jobId, partCode }: { jobId?: string; partCode: string }): Href {
  return jobId
    ? { pathname: '/equipment/stores/close-out/[jobId]', params: { jobId } }
    : { pathname: '/equipment/stores/parts/[partCode]', params: { partCode } };
}
