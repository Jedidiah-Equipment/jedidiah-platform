import { type DatabaseTransaction, type Db, user, userDepartment } from '@pkg/db';
import { createUserAccessSummary, DEPARTMENT_AWARE_ROLES } from '@pkg/domain';
import {
  AppRole,
  type AuditChanges,
  AuthId,
  Department,
  type UserAccessSummary,
  type UserListResult,
  type UserSummary,
} from '@pkg/schema';
import { asc, eq, inArray } from 'drizzle-orm';

import { insertAuditEvent } from '../audit/audit-service.js';

type UserRow = Pick<typeof user.$inferSelect, 'email' | 'emailVerified' | 'id' | 'name'> & {
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
    role: AppRole.parse(row.role),
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
  const departmentsByUserId = await listDepartmentsByUserIds({
    db,
    userIds: rows.map((row) => row.id),
  });

  return {
    users: rows.map((row) =>
      mapUser({
        ...row,
        departments: departmentsByUserId.get(row.id) ?? [],
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
            id: userId,
            member: isMember,
          },
          before: {
            department,
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

async function listDepartmentsByUserIds({ db, userIds }: { db: Db; userIds: readonly AuthId[] }) {
  const departmentsByUserId = new Map<AuthId, Department[]>();

  if (userIds.length === 0) {
    return departmentsByUserId;
  }

  const rows = await db
    .select({
      department: userDepartment.department,
      userId: userDepartment.userId,
    })
    .from(userDepartment)
    .where(inArray(userDepartment.userId, [...userIds]))
    .orderBy(asc(userDepartment.userId), asc(userDepartment.department));

  for (const row of rows) {
    const departments = departmentsByUserId.get(row.userId) ?? [];
    departments.push(row.department);
    departmentsByUserId.set(row.userId, departments);
  }

  return departmentsByUserId;
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
