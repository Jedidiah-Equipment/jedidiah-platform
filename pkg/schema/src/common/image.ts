import { z } from 'zod';
import { DateIso } from './date.js';

// Shared image primitives for any entity that stores uploaded images in private object storage.
// Entity-specific concerns (which slots exist, size caps, recommended dimensions) compose on top of
// these; keep this file free of any single feature's rules.

// Raster formats the platform renders and accepts. Vector/animated formats are intentionally excluded.
export const IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg'] as const;

export type ImageContentType = z.infer<typeof ImageContentType>;
export const ImageContentType = z.enum(IMAGE_CONTENT_TYPES);

// A populated image as exposed to clients: enough to preview and download it without leaking the
// internal storage key. `updatedAt` doubles as a cache-busting token for the image's download URL.
export type EntityImage = z.infer<typeof EntityImage>;
export const EntityImage = z.object({
  byteSize: z.number().int().nonnegative(),
  contentType: ImageContentType,
  updatedAt: DateIso,
});
