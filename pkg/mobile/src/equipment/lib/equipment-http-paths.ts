import type { ProductImageSlot } from '@pkg/schema/equipment';

/** URL of a Job Document's authenticated download route. */
export function jobDocumentDownloadPath(jobId: string, documentId: string): string {
  return `/api/jobs/${jobId}/documents/${documentId}/download`;
}

/** URL of a Product Document's authenticated download route. */
export function productDocumentDownloadPath(productId: string, documentId: string): string {
  return `/api/products/${productId}/documents/${documentId}/download`;
}

/** URL of a Quote Document's authenticated, owner-scoped download route. */
export function quoteDocumentDownloadPath(quoteId: string, documentId: string): string {
  return `/api/quotes/${quoteId}/documents/${documentId}/download`;
}

/** URL of the generated Product Brochure preview PDF. */
export function productBrochurePreviewPath(productId: string): string {
  return `/api/products/${productId}/brochure-preview`;
}

/** URL of the small WebP variant used by Product cards and detail headers. */
export function productImageDownloadPath(productId: string, slot: ProductImageSlot, updatedAt: string): string {
  return `/api/products/${encodeURIComponent(productId)}/images/${slot}/download?variant=mobile&updatedAt=${encodeURIComponent(updatedAt)}`;
}
