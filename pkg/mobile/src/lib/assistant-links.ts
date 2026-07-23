import { parseInternalAppHref } from '@pkg/schema';
import type { useRouter } from 'expo-router';

import { PRODUCT_BROCHURE_DOCUMENT_ID } from './product-brochure';

export type AssistantRouter = Pick<ReturnType<typeof useRouter>, 'push'>;

export function resolveAssistantLink(href: string, router: AssistantRouter): (() => void) | null {
  const parsed = parseInternalAppHref(href);
  if (!parsed) return null;

  switch (parsed.kind) {
    case 'quote':
      return () => router.push({ pathname: '/quotes/[quoteId]', params: { quoteId: parsed.quoteId } });
    case 'product':
      return () => router.push({ pathname: '/products/[productId]', params: { productId: parsed.productId } });
    case 'job':
      return () => router.push({ pathname: '/jobs/[jobId]', params: { jobId: parsed.jobId } });
    case 'quote-document':
      return () =>
        router.push({
          pathname: '/documents/[documentId]',
          params: { documentId: parsed.documentId, quoteId: parsed.quoteId },
        });
    case 'product-brochure':
      return () =>
        router.push({
          pathname: '/documents/[documentId]',
          params: { documentId: PRODUCT_BROCHURE_DOCUMENT_ID, productId: parsed.productId },
        });
    case 'customer':
      return null;
    default: {
      const exhaustive: never = parsed;
      return exhaustive;
    }
  }
}
