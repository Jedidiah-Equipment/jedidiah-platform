import { type ReadingRefusal, readingRefusalOf } from '@pkg/schema/contracting';
import { getApiErrorMetadata } from '@/lib/api-errors.js';
import { RouteRefusedError } from './post-route.js';

/** A Reading refusal's context, whichever transport refused: an HTTP route's body `data`, or a tRPC error's metadata. */
export const readingRefusal = (error: unknown): ReadingRefusal =>
  readingRefusalOf(error instanceof RouteRefusedError ? error.data : getApiErrorMetadata(error));
