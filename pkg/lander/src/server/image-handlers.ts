import { getDb } from './db.js';
import { imageResponse } from './image-response.js';
import { readProductHeroImage, readRangeImage } from './images.js';
import { getStorage } from './storage.js';

// Server-only orchestration shared by the public image routes: resolve the lazy DB + storage clients,
// read the bytes through the core services, and stream them (or the placeholder) back. Kept out of the
// route modules so the route tree, which the client bundle imports, never pulls in @pkg/core or the S3
// client.
export async function serveRangeImage(rangeId: string): Promise<Response> {
  return imageResponse(await readRangeImage(getStorage(), getDb(), rangeId));
}

export async function serveProductHeroImage(productId: string): Promise<Response> {
  return imageResponse(await readProductHeroImage(getStorage(), getDb(), productId));
}
