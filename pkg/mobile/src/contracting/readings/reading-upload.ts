import { READING_CAPTURE_PATH } from '@pkg/domain/contracting';
import { type ReadingCaptureInput, readingCaptureMultipartFields } from '@pkg/schema/contracting';
import { z } from 'zod';
import { authedFetch } from '@/lib/authed-fetch';
import { addBreadcrumb } from '@/lib/observability';
import { readingPhotoPart } from './reading-photo-part';

const UPLOAD_TIMEOUT_MS = 60_000;
export const CAPTURE_FAILED = 'Could not save the reading. Check your connection and try again.';

const RefusalBody = z
  .object({ message: z.string().optional(), data: z.object({ appCode: z.string().optional() }).nullish() })
  .catch({});

/** The server judged the capture and refused it; `message` is its sentence for the Foreman. */
export class ReadingRefusedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReadingRefusedError';
  }
}

export type CaptureRequest = z.input<typeof ReadingCaptureInput> & { localId: string };

/**
 * One online capture. A refusal (4xx with an app code) throws {@link ReadingRefusedError}; anything else
 * that is not a success throws a plain Error.
 */
export async function captureReading(input: CaptureRequest, photoUri: string | null): Promise<void> {
  const body = new FormData();
  for (const [name, value] of readingCaptureMultipartFields({ ...input, comment: input.comment || undefined }))
    body.append(name, value);
  if (photoUri) body.append('photo', await readingPhotoPart(photoUri), 'meter.jpg');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await authedFetch(READING_CAPTURE_PATH, {
      method: 'POST',
      body,
      signal: controller.signal,
    }).catch((error: unknown) => {
      throw new Error(CAPTURE_FAILED, { cause: error });
    });
    if (response.ok) return;
    if (response.status >= 400 && response.status < 500 && ![401, 408, 429].includes(response.status)) {
      const refusal = RefusalBody.parse(
        await response.json().catch(() => {
          addBreadcrumb('contracting', 'reading refusal response unreadable', { status: response.status });
          return null;
        }),
      );
      throw new ReadingRefusedError(
        refusal.data?.appCode ?? 'reading.refused',
        refusal.message ?? 'The server refused this reading.',
      );
    }
    throw new Error(CAPTURE_FAILED);
  } finally {
    clearTimeout(timeout);
  }
}
