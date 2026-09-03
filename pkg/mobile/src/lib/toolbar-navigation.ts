import type { Href } from 'expo-router';

export const MAIN_TAB_PARENTS = {
  activity: { href: '/equipment/activity', label: 'Activity' },
  jobs: { href: '/equipment/jobs', label: 'Jobs' },
  plan: { href: '/equipment/plan', label: 'Plan' },
  products: { href: '/equipment/products', label: 'Products' },
  quotes: { href: '/equipment/quotes', label: 'Quotes' },
  stores: { href: '/equipment/stores', label: 'Stores' },
  units: { href: '/equipment/units', label: 'Units' },
} as const;

export type MainTabParent = (typeof MAIN_TAB_PARENTS)[keyof typeof MAIN_TAB_PARENTS];

/** Modal deep links have no invoking tab, so Jobs is the stable signed-in fallback. */
export function resolveAssistantParent(href: string | undefined): MainTabParent {
  return Object.values(MAIN_TAB_PARENTS).find((parent) => parent.href === href) ?? MAIN_TAB_PARENTS.jobs;
}

export function bayToolbarParentLabel(showingSlotDetail: boolean): 'Bay schedule' | 'Plan' {
  return showingSlotDetail ? 'Bay schedule' : 'Plan';
}

export type DocumentParent = {
  id: string;
  kind: 'job' | 'product' | 'quote';
  parentLabel: 'Job' | 'Product' | 'Quote';
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
      parentLabel: 'Product',
      returnTo: { pathname: '/equipment/products/[productId]', params: { productId } },
    };
  }
  if (jobId) {
    return {
      id: jobId,
      kind: 'job',
      parentLabel: 'Job',
      returnTo: { pathname: '/equipment/jobs/[jobId]', params: { jobId } },
    };
  }
  if (quoteId) {
    return {
      id: quoteId,
      kind: 'quote',
      parentLabel: 'Quote',
      returnTo: { pathname: '/equipment/quotes/[quoteId]', params: { quoteId } },
    };
  }
  return null;
}

export function resolveStoresMovementParent({ jobId, partCode }: { jobId?: string; partCode: string }): {
  label: 'Close-out Job' | 'Part';
  returnTo: Href;
} {
  return jobId
    ? {
        label: 'Close-out Job',
        returnTo: { pathname: '/equipment/stores/close-out/[jobId]', params: { jobId } },
      }
    : {
        label: 'Part',
        returnTo: { pathname: '/equipment/stores/parts/[partCode]', params: { partCode } },
      };
}
