import { readingCaptureMultipartFields } from '@pkg/schema/contracting';
import { readingCapturePath } from '@/contracting/lib/contracting-http-paths.js';

export type ReadingCaptureFields = Parameters<typeof readingCaptureMultipartFields>[0];

/** Posts one Hour Reading capture; throws the server's sentence, or the fallback when it sent none. */
export async function captureReading(fields: ReadingCaptureFields, photo: File | null, fallbackMessage: string) {
  const body = new FormData();
  for (const [name, value] of readingCaptureMultipartFields(fields)) body.append(name, value);
  if (photo) body.append('photo', photo, photo.name);
  const response = await fetch(readingCapturePath(), { method: 'POST', body, credentials: 'include' });
  if (response.ok) return;
  const payload = await response.json().catch(() => null);
  throw new Error(typeof payload?.message === 'string' ? payload.message : fallbackMessage);
}
