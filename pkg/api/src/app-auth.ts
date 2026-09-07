import { type Db, db } from '@pkg/db';

import { type Auth, createSharedAuth } from './auth/auth.js';
import { driverRoleSafetyPlugin } from './contracting/auth/driver-role-safety.js';
import { adminUserSafetyPlugin } from './equipment/auth/admin-user-safety.js';

/** Root composition keeps business policy out of the shared Better Auth mechanism. */
export function createAuth(database: Db): Auth {
  return createSharedAuth(database, [adminUserSafetyPlugin(database), driverRoleSafetyPlugin(database)]);
}

export const auth = createAuth(db);
export type { Auth };
