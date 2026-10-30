import { type ReadingRefusal, readingRefusalOf } from '@pkg/schema/contracting';
import { getApiErrorMetadata } from '@/lib/api-errors.js';
import { MultipartRefusedError } from './post-multipart.js';

/** A Reading refusal's context, whichever transport refused: an upload's body `data`, or a tRPC error's metadata. */
export const readingRefusal = (error: unknown): ReadingRefusal =>
  readingRefusalOf(error instanceof MultipartRefusedError ? error.data : getApiErrorMetadata(error));
