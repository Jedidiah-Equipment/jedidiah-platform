import { jobCardPath } from '@pkg/domain/contracting';
import type { JobCardVariant } from '@pkg/schema/contracting';
import { getClientConfig } from '@/lib/app-config.js';

export function readingCapturePath(): string {
  return `${getClientConfig().apiBaseUrl}/api/contracting/readings`;
}

export function readingPhotoUrl(readingId: string): string {
  return `${getClientConfig().apiBaseUrl}/api/contracting/readings/${encodeURIComponent(readingId)}/photo`;
}

export function jobCardUrl(code: string, variant: JobCardVariant): string {
  return `${getClientConfig().apiBaseUrl}${jobCardPath(code, variant)}`;
}
