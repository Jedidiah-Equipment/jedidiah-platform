import { READING_CAPTURE_PATH } from '@pkg/domain/contracting';
import type { ReadingCaptureInput } from '@pkg/schema/contracting';
import type { z } from 'zod';
import { postJson } from '@/lib/multipart-upload';

const CAPTURE_TIMEOUT_MS = 60_000;
export const CAPTURE_FAILED = 'Could not save the reading. Check your connection and try again.';

export type CaptureRequest = z.input<typeof ReadingCaptureInput> & { localId: string };

/** One online capture; the server's refusal or the connection's failure throws as `postJson` says. */
export async function captureReading(input: CaptureRequest): Promise<void> {
  await postJson(
    READING_CAPTURE_PATH,
    { ...input, comment: input.comment || undefined },
    { timeoutMs: CAPTURE_TIMEOUT_MS, failedMessage: CAPTURE_FAILED },
  );
}
