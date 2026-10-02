import { jobCardPath, READING_CAPTURE_PATH, readingPhotoPath } from '@pkg/domain/contracting';
import type { JobCardVariant } from '@pkg/schema/contracting';
import { getClientConfig } from '@/lib/app-config.js';

export function readingCapturePath(): string {
  return `${getClientConfig().apiBaseUrl}${READING_CAPTURE_PATH}`;
}

export function readingPhotoUrl(readingId: string): string {
  return `${getClientConfig().apiBaseUrl}${readingPhotoPath(readingId)}`;
}

export function jobCardUrl(code: string, variant: JobCardVariant): string {
  return `${getClientConfig().apiBaseUrl}${jobCardPath(code, variant)}`;
}
