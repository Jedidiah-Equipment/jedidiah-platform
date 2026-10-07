import { READING_CAPTURE_PATH } from '@pkg/domain/contracting';
import { type ReadingCaptureInput, readingCaptureMultipartFields } from '@pkg/schema/contracting';
import type { z } from 'zod';
import { filePart } from '@/lib/file-part';
import { postMultipart } from '@/lib/multipart-upload';

const UPLOAD_TIMEOUT_MS = 60_000;
const PHOTO_MISSING = 'The photo is no longer available. Retake it.';
export const CAPTURE_FAILED = 'Could not save the reading. Check your connection and try again.';

export type CaptureRequest = z.input<typeof ReadingCaptureInput> & { localId: string };

/** One online capture; the server's refusal or the connection's failure throws as `postMultipart` says. */
export async function captureReading(input: CaptureRequest, photoUri: string | null): Promise<void> {
  const body = new FormData();
  for (const [name, value] of readingCaptureMultipartFields({ ...input, comment: input.comment || undefined }))
    body.append(name, value);
  if (photoUri) body.append('photo', await filePart(photoUri, PHOTO_MISSING), 'meter.jpg');
  await postMultipart(READING_CAPTURE_PATH, body, { timeoutMs: UPLOAD_TIMEOUT_MS, failedMessage: CAPTURE_FAILED });
}
