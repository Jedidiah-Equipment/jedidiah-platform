import type { ReadingCaptureInput } from '@pkg/schema/contracting';
import type { z } from 'zod';
import { readingCapturePath } from '@/contracting/lib/contracting-http-paths.js';
import { postJson } from '@/contracting/lib/post-route.js';

/** Posts one Hour Reading capture; throws the server's sentence, or the fallback when it sent none. */
export async function captureReading(fields: z.input<typeof ReadingCaptureInput>, fallbackMessage: string) {
  await postJson(readingCapturePath(), fields, fallbackMessage);
}
