import { type BrochurePreviewResult, generateProductBrochureIfComplete, ProductNotFoundError } from '@pkg/core';
import { renderBrochurePdf } from '@pkg/pdf';
import { UUID } from '@pkg/schema';

import { getDb } from './db.js';
import { getStorage } from './storage.js';

// The brochure PDF is generated on demand from the Product's live config, so a config edit converges
// quickly. A short shared cache softens repeat hits without pinning stale bytes.
const BROCHURE_CACHE_CONTROL = 'public, max-age=300';

// Turn a generated brochure (or its absence) into an HTTP response. A null result — an unknown id or an
// incomplete brochure — is a 404 so the public site never serves a broken or partial PDF.
export function brochureResponse(brochure: BrochurePreviewResult | null): Response {
  if (!brochure) {
    return new Response('Not found', { status: 404 });
  }

  // Wrap the bytes in a Blob: the web Response body type does not accept a bare Uint8Array here. Copy
  // into a fresh Uint8Array so the body is backed by a plain (non-shared) ArrayBuffer the lib types want.
  return new Response(new Blob([new Uint8Array(brochure.bytes)], { type: 'application/pdf' }), {
    status: 200,
    headers: {
      'cache-control': BROCHURE_CACHE_CONTROL,
      'content-disposition': `inline; filename="${brochure.filename}"`,
      'content-length': String(brochure.bytes.byteLength),
      'content-type': 'application/pdf',
    },
  });
}

// Server-only handler for the public brochure download route. Generates the PDF via @pkg/core only when
// the Product's brochure is complete; an incomplete config or unknown id yields a 404 rather than a
// broken file. Kept out of the route module so @pkg/pdf (and react-pdf) stay off the client bundle.
export async function serveProductBrochure(productId: string): Promise<Response> {
  const parsed = UUID.safeParse(productId);
  if (!parsed.success) {
    return brochureResponse(null);
  }

  try {
    const brochure = await generateProductBrochureIfComplete({
      db: getDb(),
      pdfRenderer: renderBrochurePdf,
      productId: parsed.data,
      storage: getStorage(),
    });

    return brochureResponse(brochure);
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      return brochureResponse(null);
    }

    throw error;
  }
}
