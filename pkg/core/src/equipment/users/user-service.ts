import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import { userDepartment } from '@pkg/db/equipment';
import {
  type AuditChanges,
  AuthId,
  ContractingRole,
  EquipmentRole,
  NullablePhoneNumber,
  NullableThumbnailDataUrl,
} from '@pkg/schema';
import { Department, type UserAccount, type UserListResult, type UserSummary } from '@pkg/schema/equipment';
import { asc, eq } from 'drizzle-orm';

import { defineAuditDescriptor, recordAuditEvent } from '../audit/audit-service.js';
import { mutateEntity } from '../audit/mutate-entity.js';
import { listOpenBayOperatorAssignmentBayNames } from '../jobs/job-bay-service.js';
import { UserNotFoundError } from './user-errors.js';

type UserAuditInput = Pick<
  typeof user.$inferSelect,
  'id' | 'email' | 'image' | 'isDevice' | 'lastActivitySeen' | 'phoneNumber'
>;

// `email` is the summary label, not an audited field on these paths, so it lives in `label` rather
// than `toRecord`. Department membership audits its own changes via recordAuditEvent below.
export const userAuditDescriptor = defineAuditDescriptor<UserAuditInput>({
  entityType: 'user',
  noun: 'user',
  primaryLabelField: 'email',
  entityId: (row) => row.id,
  label: (row) => row.email,
  toRecord: (row) => ({
    isDevice: row.isDevice,
    lastActivitySeen: row.lastActivitySeen,
    phoneNumber: row.phoneNumber,
    thumbnailDataUrl: row.image,
  }),
});

type UserAccountRow = Pick<
  typeof user.$inferSelect,
  | 'assistantEnabled'
  | 'contractingRole'
  | 'email'
  | 'emailVerified'
  | 'id'
  | 'image'
  | 'isDevice'
  | 'name'
  | 'phoneNumber'
  | 'role'
>;

type UserRow = UserAccountRow & {
  departments: readonly Department[];
};

function mapUserAccount(row: UserAccountRow): UserAccount {
  return {
    assistantEnabled: row.assistantEnabled,
    email: row.email,
    emailVerified: row.emailVerified,
    id: AuthId.parse(row.id),
    isDevice: row.isDevice,
    name: row.name,
    phoneNumber: NullablePhoneNumber.parse(row.phoneNumber),
    contractingRole: ContractingRole.nullable().parse(row.contractingRole),
    equipmentRole: EquipmentRole.nullable().parse(row.role),
    thumbnailDataUrl: NullableThumbnailDataUrl.parse(row.image),
  };
}

export function mapUser(row: UserRow): UserSummary {
  return {
    ...mapUserAccount(row),
    departments: row.departments.map((department) => Department.parse(department)),
  };
}

export async function getUserById({ db, userId }: { db: Db; userId: AuthId }): Promise<UserAccount> {
  const [row] = await db
    .select({
      assistantEnabled: user.assistantEnabled,
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      image: user.image,
      isDevice: user.isDevice,
      name: user.name,
      phoneNumber: user.phoneNumber,
      contractingRole: user.contractingRole,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!row) {
    throw new UserNotFoundError(userId);
  }

  return mapUserAccount(row);
}

export async function listUsers({ db }: { db: Db }): Promise<UserListResult> {
  const rows = await db
    .select({
      assistantEnabled: user.assistantEnabled,
      department: userDepartment.department,
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      image: user.image,
      isDevice: user.isDevice,
      name: user.name,
      phoneNumber: user.phoneNumber,
      contractingRole: user.contractingRole,
      role: user.role,
    })
    .from(user)
    .leftJoin(userDepartment, eq(userDepartment.userId, user.id))
    .orderBy(asc(user.email), asc(userDepartment.department));
  const users = new Map<string, UserSummary>();

  for (const { department, ...row } of rows) {
    const summary = users.get(row.id) ?? mapUser({ ...row, departments: [] });
    if (department !== null) summary.departments.push(department);
    users.set(row.id, summary);
  }

  return { users: [...users.values()] };
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

/**
 * Marks an account as a shared device, or back to a person.
 *
 * Gated at the API on `user:set-role` rather than `user:update`, because this decides whether the
 * account may sign for stock at all — the same class of decision as granting it the stores role,
 * and a stronger one than editing a phone number.
 */
export async function setUserIsDevice({
  actorUserId,
  db,
  isDevice,
  userId,
}: {
  actorUserId: AuthId;
  db: Db;
  isDevice: boolean;
  userId: AuthId;
}): Promise<UserAccount> {
  return mutateEntity({
    actorUserId,
    db,
    descriptor: userAuditDescriptor,
    id: userId,
    notFound: () => new UserNotFoundError(userId),
    project: (_tx, row) => mapUserAccount(row),
    set: () => ({ isDevice, updatedAt: new Date() }),
    table: user,
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
  return mutateEntity({
    actorUserId,
    db,
    descriptor: userAuditDescriptor,
    id: userId,
    notFound: () => new UserNotFoundError(userId),
    project: (_tx, row) => mapUserAccount(row),
    set: () => ({ image: thumbnailDataUrl, updatedAt: new Date() }),
    table: user,
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
  | { allowed: false; reason: 'reserved-super-admin' }
  | { allowed: false; reason: 'super-admin-spans-contracting' };

// super-admin fills both slots by definition (ADR 0017), so a contracting role beside it is a
// contradiction rather than a grant.
function isContractingRoleBesideSuperAdmin({
  contractingRole,
  equipmentRole,
}: {
  contractingRole?: ContractingRole | null | undefined;
  equipmentRole?: EquipmentRole | null | undefined;
}): boolean {
  return equipmentRole === 'super-admin' && contractingRole != null;
}

// Reserved-role predicate (ADR 0017/0008): only a super-admin may grant the super-admin role or
// change a user who currently holds it.
function isReservedSuperAdminAssignment({
  actorRole,
  currentRole,
  targetRole,
}: {
  actorRole: EquipmentRole;
  currentRole: EquipmentRole | null;
  targetRole: EquipmentRole | null;
}): boolean {
  return (targetRole === 'super-admin' || currentRole === 'super-admin') && actorRole !== 'super-admin';
}

/**
 * The one role-assignment decision for create-user, update-user and set-role. `userId` is omitted
 * when creating a user, where there is no stored role to move away from; the same rules then run
 * against empty slots.
 *
 * This policy check runs in its own transaction, but the role write it guards happens later inside
 * better-auth, outside any lock taken here. A concurrent operator assignment can land between this
 * check and that write — an accepted race: the window is tiny, the flow is admin-only, and the
 * one-operator-per-bay invariant itself is enforced by the database.
 */
export async function canAssignUserRoleSlots({
  actorRole,
  contractingRole,
  db,
  equipmentRole,
  userId,
}: {
  actorRole: EquipmentRole;
  contractingRole?: ContractingRole | null;
  db: Db;
  equipmentRole?: EquipmentRole | null;
  userId?: AuthId;
}): Promise<UserRoleAssignmentPolicyResult> {
  return db.transaction(async (tx) => {
    const [targetUser] =
      userId === undefined
        ? []
        : await tx
            .select({
              contractingRole: user.contractingRole,
              id: user.id,
              equipmentRole: user.role,
            })
            .from(user)
            .where(eq(user.id, userId))
            .for('update');

    const currentEquipmentRole = EquipmentRole.nullable().parse(targetUser?.equipmentRole ?? null);
    const currentContractingRole = ContractingRole.nullable().parse(targetUser?.contractingRole ?? null);
    const nextEquipmentRole = equipmentRole === undefined ? currentEquipmentRole : equipmentRole;
    const nextContractingRole = contractingRole === undefined ? currentContractingRole : contractingRole;

    if (currentEquipmentRole === nextEquipmentRole && currentContractingRole === nextContractingRole) {
      return { allowed: true };
    }

    if (
      isReservedSuperAdminAssignment({ actorRole, currentRole: currentEquipmentRole, targetRole: nextEquipmentRole })
    ) {
      return { allowed: false, reason: 'reserved-super-admin' };
    }

    // Only an explicit contracting value is contradictory; a contracting role already stored when
    // super-admin arrives is cleared by the write itself.
    if (isContractingRoleBesideSuperAdmin({ contractingRole, equipmentRole: nextEquipmentRole })) {
      return { allowed: false, reason: 'super-admin-spans-contracting' };
    }

    if (!targetUser) {
      return { allowed: true };
    }

    if (equipmentRole !== undefined && currentEquipmentRole === 'bay-operator') {
      const openBayOperatorAssignmentBayNames = await listOpenBayOperatorAssignmentBayNames({
        db: tx,
        userId: targetUser.id,
      });

      if (openBayOperatorAssignmentBayNames.length > 0) {
        return {
          allowed: false,
          bayNames: openBayOperatorAssignmentBayNames,
          reason: 'open-bay-operator-assignments',
        };
      }
    }

    if (equipmentRole === undefined || equipmentRole === 'admin' || currentEquipmentRole !== 'admin') {
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

    if (adminRows.length <= 1 && adminRows.some((adminUser) => adminUser.id === targetUser.id)) {
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
