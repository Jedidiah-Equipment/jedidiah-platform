import { type Db, db } from '@pkg/db';

import { type Auth, createAuth as createSharedAuth } from './auth/auth.js';
import { adminUserSafetyPlugin } from './equipment/auth/admin-user-safety.js';

/** Root composition keeps Equipment policy out of the shared Better Auth mechanism. */
export function createAuth(database: Db): Auth {
  return createSharedAuth(database, [adminUserSafetyPlugin(database)]);
}

export const auth = createAuth(db);
export type { Auth };
