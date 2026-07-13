import {
  type BrochurePreviewResult,
  generateProductBrochureIfComplete,
  getProduct,
  ProductNotFoundError,
  StorageObjectNotFoundError,
} from '@pkg/core';
import { isBrochureReady } from '@pkg/domain';
import { renderBrochurePdf } from '@pkg/pdf';
import { CANONICAL_LOCALE, Locale, UUID } from '@pkg/schema';

import { getDb } from '../runtime/db.js';
import { getStorage } from '../runtime/storage.js';

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

export function resolveBrochureLocale(requestUrl: string): Locale {
  return Locale.catch(CANONICAL_LOCALE).parse(new URL(requestUrl).searchParams.get('locale'));
}

// Server-only handler for the public brochure download route. Serves the PDF only when the Product's
// brochure is publicly ready — the publish flag is on AND the config is complete — so an unpublished,
// incomplete, or unknown Product all yield a 404 rather than leaking a brochure via a guessed id (the
// detail page exposes the Product id in its image URLs). Kept out of the route module so @pkg/pdf (and
// react-pdf) stay off the client bundle.
export async function serveProductBrochure(productId: string, locale: Locale): Promise<Response> {
  const parsed = UUID.safeParse(productId);
  if (!parsed.success) {
    return brochureResponse(null);
  }

  const db = getDb();

  try {
    // Enforce the publish flag here, not just on the link: completeness alone would let anyone download an
    // unpublished brochure by constructing the URL from the Product id.
    const product = await getProduct({ db, id: parsed.data });
    if (!isBrochureReady(product)) {
      return brochureResponse(null);
    }

    const brochure = await generateProductBrochureIfComplete({
      db,
      locale,
      pdfRenderer: renderBrochurePdf,
      productId: parsed.data,
      storage: getStorage(),
    });

    return brochureResponse(brochure);
  } catch (error) {
    // The completeness gate only checks that image refs exist in the DB, not that the S3 objects are
    // still present. A missing Product or a missing stored asset both mean "no real PDF to serve", so
    // both hide behind a 404 rather than surfacing a 500 — matching how the image routes treat them.
    if (error instanceof ProductNotFoundError || error instanceof StorageObjectNotFoundError) {
      return brochureResponse(null);
    }

    throw error;
  }
}
