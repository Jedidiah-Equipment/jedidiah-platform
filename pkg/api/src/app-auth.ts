import { type Db, db } from '@pkg/db';

import { type Auth, createSharedAuth } from './auth/auth.js';
import { contractingRoleSafetyPlugin } from './contracting/auth/contracting-role-safety.js';
import { adminUserSafetyPlugin } from './equipment/auth/admin-user-safety.js';

/** Root composition keeps business policy out of the shared Better Auth mechanism. */
export function createAuth(database: Db): Auth {
  return createSharedAuth(database, [adminUserSafetyPlugin(database), contractingRoleSafetyPlugin(database)]);
}

export const auth = createAuth(db);
export type { Auth };
