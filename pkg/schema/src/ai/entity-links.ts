import { z } from 'zod';

export type InternalAppHref = z.infer<typeof InternalAppHref>;
export const InternalAppHref = z.string().refine(isInternalAppHref, 'Expected an internal absolute-path link');

export type ParsedInternalAppHref =
  | { kind: 'product'; productId: string }
  | { kind: 'customer'; customerId: string }
  | { kind: 'quote'; quoteId: string }
  | { kind: 'job'; jobId: string }
  | { kind: 'quote-document'; quoteId: string; documentId: string }
  | { kind: 'product-brochure'; productId: string };

const HREF_PATTERNS = [
  {
    regex: /^\/products\/([^/]+)\/edit$/,
    parse: (match: RegExpExecArray): ParsedInternalAppHref => ({
      kind: 'product',
      productId: readCapture(match, 1),
    }),
  },
  {
    regex: /^\/customers\/([^/]+)\/edit$/,
    parse: (match: RegExpExecArray): ParsedInternalAppHref => ({
      kind: 'customer',
      customerId: readCapture(match, 1),
    }),
  },
  {
    regex: /^\/quotes\/([^/]+)\/edit$/,
    parse: (match: RegExpExecArray): ParsedInternalAppHref => ({
      kind: 'quote',
      quoteId: readCapture(match, 1),
    }),
  },
  {
    regex: /^\/jobs\/([^/]+)$/,
    parse: (match: RegExpExecArray): ParsedInternalAppHref => ({ kind: 'job', jobId: readCapture(match, 1) }),
  },
  {
    regex: /^\/api\/quotes\/([^/]+)\/documents\/([^/]+)\/download$/,
    parse: (match: RegExpExecArray): ParsedInternalAppHref => ({
      kind: 'quote-document',
      quoteId: readCapture(match, 1),
      documentId: readCapture(match, 2),
    }),
  },
  {
    regex: /^\/api\/products\/([^/]+)\/brochure-preview$/,
    parse: (match: RegExpExecArray): ParsedInternalAppHref => ({
      kind: 'product-brochure',
      productId: readCapture(match, 1),
    }),
  },
] as const;

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

/** Returns null for external, malformed, unsupported, or unsafe App Links. */
export function parseInternalAppHref(href: string): ParsedInternalAppHref | null {
  if (!InternalAppHref.safeParse(href).success) {
    return null;
  }

  for (const pattern of HREF_PATTERNS) {
    const match = pattern.regex.exec(href);
    if (match?.slice(1).every(isSafePathSegment)) {
      return pattern.parse(match);
    }
  }

  return null;
}

function isInternalAppHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.includes('\\') && ![...href].some(isControlCharacter);
}

function isSafePathSegment(segment: string): boolean {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded !== '.' && decoded !== '..' && !decoded.includes('/') && !decoded.includes('\\');
  } catch {
    return false;
  }
}

function readCapture(match: RegExpExecArray, index: number): string {
  const capture = match[index];
  if (capture === undefined) {
    throw new Error('Assistant App Link pattern is missing its expected capture');
  }
  return capture;
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
}
