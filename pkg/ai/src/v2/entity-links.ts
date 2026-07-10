import { z } from 'zod';

const APP_ORIGIN = 'https://app.invalid';

export type InternalAppHref = z.infer<typeof InternalAppHref>;
export const InternalAppHref = z.string().refine(isInternalAppHref, 'Expected an internal absolute-path link');

export function createProductAppHref(productId: string): InternalAppHref {
  return InternalAppHref.parse(`/products/${productId}/edit`);
}

export function createCustomerAppHref(customerId: string): InternalAppHref {
  return InternalAppHref.parse(`/customers/${customerId}/edit`);
}

export function createQuoteAppHref(quoteId: string): InternalAppHref {
  return InternalAppHref.parse(`/quotes/${quoteId}/edit`);
}

export function createJobAppHref(jobId: string): InternalAppHref {
  return InternalAppHref.parse(`/jobs/${jobId}`);
}

export function createQuoteDocumentDownloadHref(quoteId: string, documentId: string): InternalAppHref {
  return InternalAppHref.parse(`/api/quotes/${quoteId}/documents/${documentId}/download`);
}

export function createProductBrochureDownloadHref(productId: string): InternalAppHref {
  return InternalAppHref.parse(`/api/products/${productId}/brochure-preview`);
}

function isInternalAppHref(href: string): boolean {
  if (!href.startsWith('/') || href.includes('\\') || [...href].some(isControlCharacter)) {
    return false;
  }

  try {
    return new URL(href, APP_ORIGIN).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
}
