import type { AuthId } from '@pkg/schema';
import { IconIdBadge2 } from '@tabler/icons-react';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { userBadgeUrl } from '../user-badge.js';

/**
 * Prints the card the stores tablet's quick-switch scans (spec §11). Offered only for stores people,
 * because that is the only role the quick-switch grid ever offers — a card for anyone else would
 * scan to a name the tablet then refuses, which reads as a broken badge rather than a wrong one.
 */
export const UserBadgePrintButton: React.FC<{ userId: AuthId }> = ({ userId }) => (
  <Button
    className="mt-4 w-full"
    render={<a href={userBadgeUrl(userId)} rel="noreferrer" target="_blank" />}
    type="button"
    variant="outline"
  >
    <IconIdBadge2 data-icon="inline-start" />
    Print stores badge
  </Button>
);
