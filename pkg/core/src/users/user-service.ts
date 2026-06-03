import { type DatabaseTransaction, type Db, user, userDepartment } from '@pkg/db';
import { createUserAccessSummary, DEPARTMENT_AWARE_ROLES } from '@pkg/domain';
import {
  AppRole,
  type AuditChanges,
  AuthId,
  Department,
  NullablePhoneNumber,
  NullableThumbnailDataUrl,
  type UserAccessSummary,
  UserAccount,
  type UserListResult,
  type UserSummary,
} from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, userAuditDescriptor } from '../audit/audit-service.js';
import { UserNotFoundError } from './user-errors.js';

type UserRow = Pick<typeof user.$inferSelect, 'email' | 'emailVerified' | 'id' | 'image' | 'name' | 'phoneNumber'> & {
  departments: readonly Department[];
  role?: unknown;
};

export function mapUser(row: UserRow): UserSummary {
  return {
    departments: row.departments.map((department) => Department.parse(department)),
    email: row.email,
    emailVerified: row.emailVerified,
    id: AuthId.parse(row.id),
    name: row.name,
    phoneNumber: NullablePhoneNumber.parse(row.phoneNumber),
    role: AppRole.parse(row.role),
    thumbnailDataUrl: NullableThumbnailDataUrl.parse(row.image),
  };
}

export async function getUserById({ db, userId }: { db: Db; userId: AuthId }): Promise<UserAccount> {
  const [row] = await db
    .select({
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      image: user.image,
      name: user.name,
      phoneNumber: user.phoneNumber,
      role: user.role,
      thumbnailDataUrl: user.image,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!row) {
    throw new UserNotFoundError(userId);
  }

  return UserAccount.parse(row);
}

export async function listUsers({ db }: { db: Db }): Promise<UserListResult> {
  const rows = await db.query.user.findMany({
    columns: {
      email: true,
      emailVerified: true,
      id: true,
      image: true,
      name: true,
      phoneNumber: true,
      role: true,
    },
    orderBy: [asc(user.email)],
    with: {
      departments: {
        columns: {
          department: true,
        },
        orderBy: [asc(userDepartment.department)],
      },
    },
  });

  return {
    users: rows.map((row) =>
      mapUser({
        ...row,
        departments: row.departments.map((department) => department.department),
      }),
    ),
  };
}

export async function getUserAccessSummary({
  db,
  role,
  userId,
}: {
  db: Db;
  role: AppRole;
  userId: AuthId;
}): Promise<UserAccessSummary> {
  const departments = DEPARTMENT_AWARE_ROLES.has(role) ? await listUserDepartments({ db, userId }) : [];

  return createUserAccessSummary({
    departments,
    role,
    userId,
  });
}

export async function setUserDepartments({
  db,
  actorUserId,
  departments,
  userId,
}: {
  db: Db;
  actorUserId: AuthId;
  departments: Department[];
  userId: AuthId;
}): Promise<Department[]> {
  return db.transaction(async (tx) => {
    const targetUser = await getAuditTargetUser({ db: tx, userId });
    const before = await listUserDepartments({ db: tx, userId });
    const after = await setUserDepartmentsInTransaction({
      db: tx,
      departments,
      userId,
    });

    for (const department of getChangedDepartments(before, after)) {
      const wasMember = before.includes(department);
      const isMember = after.includes(department);
      const changes = {
        department: {
          from: wasMember ? department : null,
          to: isMember ? department : null,
        },
        member: {
          from: wasMember,
          to: isMember,
        },
      } satisfies AuditChanges;

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'updated',
          actorUserId,
          after: {
            department,
            email: targetUser.email,
            id: userId,
            member: isMember,
          },
          before: {
            department,
            email: targetUser.email,
            id: userId,
            member: wasMember,
          },
          changes,
          entityId: userId,
          entityType: 'user',
        },
      });
    }

    return after;
  });
}

export async function updateUserThumbnail({
  actorUserId,
  db,
  thumbnailDataUrl,
  userId,
}: {
  actorUserId: AuthId;
  db: Db;
  thumbnailDataUrl: NullableThumbnailDataUrl;
  userId: AuthId;
}): Promise<UserAccount> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(user).where(eq(user.id, userId)).for('update');

    if (!before) {
      throw new UserNotFoundError(userId);
    }

    const after = { ...before, thumbnailDataUrl };
    const beforeAuditRecord = { ...before, thumbnailDataUrl: before.image };
    const changes = createAuditChanges(beforeAuditRecord, after, userAuditDescriptor.fields);

    if (!changes) {
      return UserAccount.parse(mapUser({ ...before, departments: [] }));
    }

    const [row] = await tx
      .update(user)
      .set({ image: thumbnailDataUrl, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning();

    if (!row) {
      throw new UserNotFoundError(userId);
    }

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'updated',
        actorUserId,
        after: { ...row, thumbnailDataUrl: row.image },
        before: beforeAuditRecord,
        changes,
        entityId: row.id,
        entityType: userAuditDescriptor.entityType,
      },
    });

    return UserAccount.parse(mapUser({ ...row, departments: [] }));
  });
}

async function getAuditTargetUser({
  db,
  userId,
}: {
  db: DatabaseTransaction;
  userId: AuthId;
}): Promise<Pick<typeof user.$inferSelect, 'email'>> {
  const [targetUser] = await db
    .select({
      email: user.email,
    })
    .from(user)
    .where(eq(user.id, userId));

  if (!targetUser) {
    throw new UserNotFoundError(userId);
  }

  return targetUser;
}

export async function listUserDepartments({
  db,
  userId,
}: {
  db: Db | DatabaseTransaction;
  userId: AuthId;
}): Promise<Department[]> {
  const rows = await db
    .select({
      department: userDepartment.department,
    })
    .from(userDepartment)
    .where(eq(userDepartment.userId, userId))
    .orderBy(asc(userDepartment.department));

  return rows.map((row) => row.department);
}

export async function canAssignUserRole({
  db,
  role,
  userId,
}: {
  db: Db;
  role: AppRole;
  userId: AuthId;
}): Promise<boolean> {
  if (role === 'admin') {
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

    if (!targetUser || AppRole.parse(targetUser.role) !== 'admin') {
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

async function setUserDepartmentsInTransaction({
  db,
  departments,
  userId,
}: {
  db: DatabaseTransaction;
  departments: readonly Department[];
  userId: AuthId;
}): Promise<Department[]> {
  await db.delete(userDepartment).where(eq(userDepartment.userId, userId));

  if (departments.length > 0) {
    await db.insert(userDepartment).values(
      departments.map((department) => ({
        department,
        userId,
      })),
    );
  }

  return [...departments];
}

function getChangedDepartments(before: readonly Department[], after: readonly Department[]): Department[] {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  return [...new Set([...before, ...after])].filter(
    (department) => beforeSet.has(department) !== afterSet.has(department),
  );
}
