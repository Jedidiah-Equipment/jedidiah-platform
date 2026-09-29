import { readingCaptureMultipartFields } from '@pkg/schema/contracting';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingCapturePath } from '@/contracting/lib/contracting-http-paths.js';

type ReadingCaptureFields = Parameters<typeof readingCaptureMultipartFields>[0];

export function useReadingCapture() {
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();

  return async (fields: ReadingCaptureFields, photo: File | null, fallbackMessage: string) => {
    const body = new FormData();
    for (const [name, value] of readingCaptureMultipartFields(fields)) body.append(name, value);
    if (photo) body.append('photo', photo, photo.name);

    const response = await fetch(readingCapturePath(), { method: 'POST', body, credentials: 'include' });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(typeof payload?.message === 'string' ? payload.message : fallbackMessage);
    }
    await Promise.all([invalidateJobs(), invalidateReadings()]);
  };
}
