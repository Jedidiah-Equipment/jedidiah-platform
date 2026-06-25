import { type DatabaseTransaction, type Db, user, userDepartment } from '@pkg/db';
import {
  AppRole,
  type AuditChanges,
  AuthId,
  Department,
  NullablePhoneNumber,
  NullableThumbnailDataUrl,
  UserAccount,
  type UserListResult,
  type UserSummary,
} from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';

import { defineAuditDescriptor, diffAuditUpdate, recordAuditEvent, recordAuditUpdate } from '../audit/audit-service.js';
import { listOpenBayOperatorAssignmentBayNames } from '../jobs/job-bay-service.js';
import { UserNotFoundError } from './user-errors.js';

type UserAuditInput = Pick<typeof user.$inferSelect, 'id' | 'email' | 'image' | 'phoneNumber'>;

// `email` is the summary label, not an audited field on these paths, so it lives in `label` rather
// than `toRecord`. Department membership audits its own changes via recordAuditEvent below.
export const userAuditDescriptor = defineAuditDescriptor<UserAuditInput>({
  entityType: 'user',
  noun: 'user',
  primaryLabelField: 'email',
  entityId: (row) => row.id,
  label: (row) => row.email,
  toRecord: (row) => ({
    phoneNumber: row.phoneNumber,
    thumbnailDataUrl: row.image,
  }),
});

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

      await recordAuditEvent({
        db: tx,
        descriptor: userAuditDescriptor,
        action: 'updated',
        actorUserId,
        entityId: userId,
        changes,
        record: { email: targetUser.email },
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

    const after = { ...before, image: thumbnailDataUrl };
    const changes = diffAuditUpdate(userAuditDescriptor, before, after);

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

    await recordAuditUpdate({ db: tx, descriptor: userAuditDescriptor, actorUserId, after: row, changes });

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

export type UserRoleAssignmentPolicyResult =
  | { allowed: true }
  | { allowed: false; reason: 'last-admin' }
  | { allowed: false; bayNames: string[]; reason: 'open-bay-operator-assignments' }
  | { allowed: false; reason: 'reserved-super-admin' };

// Single source of truth for the reserved super-admin rule (ADR 0001/0008): only a super-admin may
// grant the super-admin role or change a user who currently holds it. `currentRole` is omitted when
// creating a brand-new user, where there is no role to move away from.
export function isReservedSuperAdminAssignment({
  actorRole,
  currentRole,
  targetRole,
}: {
  actorRole: AppRole;
  currentRole?: AppRole;
  targetRole: AppRole;
}): boolean {
  return (targetRole === 'super-admin' || currentRole === 'super-admin') && actorRole !== 'super-admin';
}

// This policy check runs in its own transaction, but the role write it guards happens later inside
// better-auth, outside any lock taken here. A concurrent operator assignment can land between this
// check and that write — an accepted race: the window is tiny, the flow is admin-only, and the
// one-operator-per-bay invariant itself is enforced by the database.
export async function canAssignUserRole({
  actorRole,
  db,
  role,
  userId,
}: {
  actorRole: AppRole;
  db: Db;
  role: AppRole;
  userId: AuthId;
}): Promise<UserRoleAssignmentPolicyResult> {
  return db.transaction(async (tx) => {
    const [targetUser] = await tx
      .select({
        id: user.id,
        role: user.role,
      })
      .from(user)
      .where(eq(user.id, userId))
      .for('update');

    if (!targetUser) {
      return { allowed: true };
    }

    const currentRole = AppRole.parse(targetUser.role);

    if (currentRole === role) {
      return { allowed: true };
    }

    if (isReservedSuperAdminAssignment({ actorRole, currentRole, targetRole: role })) {
      return { allowed: false, reason: 'reserved-super-admin' };
    }

    if (currentRole === 'bay-operator') {
      const openBayOperatorAssignmentBayNames = await listOpenBayOperatorAssignmentBayNames({
        db: tx,
        userId,
      });

      if (openBayOperatorAssignmentBayNames.length > 0) {
        return {
          allowed: false,
          bayNames: openBayOperatorAssignmentBayNames,
          reason: 'open-bay-operator-assignments',
        };
      }
    }

    if (role === 'admin' || currentRole !== 'admin') {
      return { allowed: true };
    }

    const adminRows = await tx
      .select({
        id: user.id,
      })
      .from(user)
      .where(eq(user.role, 'admin'))
      .orderBy(asc(user.id))
      .for('update');

    if (adminRows.length <= 1 && adminRows.some((adminUser) => adminUser.id === userId)) {
      return { allowed: false, reason: 'last-admin' };
    }

    return { allowed: true };
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
