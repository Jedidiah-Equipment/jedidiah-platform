import { breakdownPhotoPath } from '@pkg/domain/contracting';
import { apiBaseUrl } from '@/lib/api-base-url';
import type { BreakdownPhotoSource } from './breakdown-photo-source';

/** The browser sends the session cookie and owns caching on web. */
export function useBreakdownPhotoSource(breakdownId: string, photoId: string): BreakdownPhotoSource {
  return { kind: 'ready', uri: `${apiBaseUrl}${breakdownPhotoPath(breakdownId, photoId)}` };
}
