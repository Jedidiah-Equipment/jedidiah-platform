import { readingCaptureMultipartFields } from '@pkg/schema/contracting';
import { readingCapturePath } from '@/contracting/lib/contracting-http-paths.js';
import { postMultipart } from '@/contracting/lib/post-multipart.js';

export type ReadingCaptureFields = Parameters<typeof readingCaptureMultipartFields>[0];

/** Posts one Hour Reading capture; throws the server's sentence, or the fallback when it sent none. */
export async function captureReading(fields: ReadingCaptureFields, photo: File | null, fallbackMessage: string) {
  const body = new FormData();
  for (const [name, value] of readingCaptureMultipartFields(fields)) body.append(name, value);
  if (photo) body.append('photo', photo, photo.name);
  await postMultipart(readingCapturePath(), body, fallbackMessage);
}
