import { user } from '@pkg/db';
import { and, eq, isNull, or, type SQL } from 'drizzle-orm';

/**
 * A real person who can still act: not a shared device and not banned. Each business narrows it by the role it cares
 * about.
 */
export function activePersonCondition(): SQL {
  return and(eq(user.isDevice, false), notDisabledCondition()) as SQL;
}

/** A User an admin has not disabled (better-auth's `banned`), for pickers that handle shared devices on their own. */
export function notDisabledCondition(): SQL {
  return or(isNull(user.banned), eq(user.banned, false)) as SQL;
}
