import { z } from 'zod';
import { DateIso } from './date.js';

// Shared file primitives for any entity that stores uploaded files in private object storage. Content-type
// agnostic: an image slot, a document, or any other stored file composes on top of these. Entity-specific
// concerns (which slots exist, allowed formats, size caps) layer above; keep this file free of any single
// feature's rules.

// A populated stored file as exposed to clients: enough to preview and download it without leaking the
// internal storage key. `updatedAt` doubles as a cache-busting token for the file's download URL.
export type EntityFile = z.infer<typeof EntityFile>;
export const EntityFile = z.object({
  byteSize: z.number().int().nonnegative(),
  contentType: z.string(),
  updatedAt: DateIso,
});
