import { getClientConfig } from '@/lib/app-config.js';

export function readingCapturePath(): string {
  return `${getClientConfig().apiBaseUrl}/api/contracting/readings`;
}

export function readingPhotoUrl(readingId: string): string {
  return `${getClientConfig().apiBaseUrl}/api/contracting/readings/${encodeURIComponent(readingId)}/photo`;
}
