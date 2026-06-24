import { getDb } from '../runtime/db.js';
import { getStorage } from '../runtime/storage.js';
import { imageResponse } from './image-response.js';
import { readProductImageSlot, readRangeImage } from './images.js';

// Server-only orchestration shared by the public image routes: resolve the lazy DB + storage clients,
// read the bytes through the core services, and stream them (or the placeholder) back. Kept out of the
// route modules so the route tree, which the client bundle imports, never pulls in @pkg/core or the S3
// client.
export async function serveRangeImage(rangeId: string): Promise<Response> {
  return imageResponse(await readRangeImage(getStorage(), getDb(), rangeId));
}

export async function serveProductImage(productId: string, slot?: string | null): Promise<Response> {
  return imageResponse(await readProductImageSlot(getStorage(), getDb(), productId, slot));
}
