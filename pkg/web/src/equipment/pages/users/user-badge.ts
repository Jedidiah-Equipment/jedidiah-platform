import type { AuthId } from '@pkg/schema';

import { getClientConfig } from '@/lib/app-config.js';

export function userBadgeUrl(userId: AuthId): string {
  return `${getClientConfig().apiBaseUrl}/api/users/${encodeURIComponent(userId)}/badge`;
}
