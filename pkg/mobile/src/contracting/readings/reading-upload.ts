import { FieldReading, type ReadingCaptureInput, readingCaptureMultipartFields } from '@pkg/schema/contracting';
import { z } from 'zod';
import { readingCapturePath } from '@/contracting/lib/contracting-http-paths';
import { apiBaseUrl } from '@/lib/api-base-url';
import { sessionCookieHeader } from '@/lib/auth';
import { withSessionCookie } from '@/lib/authed-fetch';
import { addBreadcrumb } from '@/lib/observability';
import { readingPhotoPart } from './reading-photo-part';

const UPLOAD_TIMEOUT_MS = 60_000;
export const CAPTURE_FAILED = 'Could not save the reading. Check your connection and try again.';

const DeliveredReading = z.looseObject({ photo: z.unknown() });
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
 * throws a plain Error. Returns the stored reading in field shape so history updates without a refetch.
 */
export async function captureReading(
  input: CaptureRequest,
  photoUri: string | null,
  send: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<FieldReading> {
  const body = new FormData();
  for (const [name, value] of readingCaptureMultipartFields({ ...input, comment: input.comment || undefined }))
    body.append(name, value);
  if (photoUri) body.append('photo', await readingPhotoPart(photoUri), 'meter.jpg');
  const cookie = await sessionCookieHeader();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await observedReadingUpload(body, cookie, controller.signal, send);
    if (response.ok) {
      const row = DeliveredReading.parse(await response.json());
      return FieldReading.parse({ ...row, photoBacked: !!row.photo });
    }
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

async function observedReadingUpload(
  body: FormData,
  cookie: string | null,
  signal: AbortSignal,
  send: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Response> {
  const startedAt = Date.now();
  const route = readingCapturePath();
  try {
    const response = await send(`${apiBaseUrl}${route}`, withSessionCookie({ method: 'POST', body, signal }, cookie));
    addBreadcrumb('network', 'reading upload', {
      durationMs: Date.now() - startedAt,
      method: 'POST',
      route,
      status: response.status,
    });
    return response;
  } catch (error) {
    addBreadcrumb('network', 'reading upload failed', {
      durationMs: Date.now() - startedAt,
      method: 'POST',
      route,
      status: 0,
    });
    throw new Error(CAPTURE_FAILED, { cause: error });
  }
}
