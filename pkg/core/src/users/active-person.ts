import { user } from '@pkg/db';
import { and, eq, isNull, or, type SQL } from 'drizzle-orm';

/**
 * A real person who can still act: not a shared device and not banned. Each business narrows it by the role it cares
 * about.
 */
export function activePersonCondition(): SQL {
  return and(eq(user.isDevice, false), or(isNull(user.banned), eq(user.banned, false))) as SQL;
}
