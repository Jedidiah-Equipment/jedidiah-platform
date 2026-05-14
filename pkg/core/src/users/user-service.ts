import type { Db } from '@pkg/db';
import { user } from '@pkg/db/schema';
import { DEFAULT_APP_ROLE } from '@pkg/domain';
import { AppRole, type AuthId, type UserListResult, type UserSummary } from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';

type UserRow = Pick<typeof user.$inferSelect, 'email' | 'emailVerified' | 'id' | 'name'> & {
  role?: unknown;
};

export function mapUser(row: UserRow): UserSummary {
  return {
    email: row.email,
    emailVerified: row.emailVerified,
    id: row.id,
    name: row.name,
    role: parseStoredAppRole(row.role),
  };
}

export async function listUsers({ db }: { db: Db }): Promise<UserListResult> {
  const rows = await db
    .select({
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      name: user.name,
      role: user.role,
    })
    .from(user)
    .orderBy(asc(user.email));

  return {
    users: rows.map(mapUser),
  };
}

export async function canAssignUserRole({
  db,
  role,
  userId,
}: {
  db: Db;
  role: AppRole | readonly AppRole[];
  userId: AuthId;
}): Promise<boolean> {
  const nextRoles = Array.isArray(role) ? role : [role];

  if (nextRoles.includes('admin')) {
    return true;
  }

  return db.transaction(async (tx) => {
    const [targetUser] = await tx
      .select({
        id: user.id,
        role: user.role,
      })
      .from(user)
      .where(eq(user.id, userId))
      .for('update');

    if (!targetUser || !normalizeStoredAppRoles(targetUser.role).includes('admin')) {
      return true;
    }

    const adminRows = await tx
      .select({
        id: user.id,
      })
      .from(user)
      .where(eq(user.role, 'admin'))
      .orderBy(asc(user.id))
      .for('update');

    return !(adminRows.length <= 1 && adminRows.some((adminUser) => adminUser.id === userId));
  });
}

function parseStoredAppRole(role: unknown): AppRole {
  const parsedRole = AppRole.safeParse(role);

  return parsedRole.success ? parsedRole.data : DEFAULT_APP_ROLE;
}

function normalizeStoredAppRoles(role: unknown): AppRole[] {
  const rawRoles = Array.isArray(role) ? role : typeof role === 'string' ? role.split(',') : [];

  return rawRoles
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is AppRole => AppRole.safeParse(value).success);
}
