import { createGlobalSearchCondition, type DatabaseTransaction, type Db, user } from '@pkg/db';
import { userDepartment } from '@pkg/db/equipment';
import { departmentLabels } from '@pkg/domain/equipment';
import { type AuditChanges, AuthId, ContractingRole, EquipmentRole } from '@pkg/schema';
import { Department, type EquipmentUserListInput, type UserDepartmentListResult } from '@pkg/schema/equipment';
import { and, asc, eq, exists, sql } from 'drizzle-orm';

import { recordAuditEvent } from '../../audit/audit-writer.js';
import { UserNotFoundError } from '../../users/user-errors.js';
import { listUsers, userAuditDescriptor } from '../../users/user-service.js';
import { listOpenBayOperatorAssignmentBayNames } from '../jobs/job-bay-service.js';

/** Every User's Department Membership, for the equipment user table to read beside the shared account rows. */
export async function listUserDepartmentMemberships({ db }: { db: Db }): Promise<UserDepartmentListResult> {
  const rows = await db
    .select({ department: userDepartment.department, userId: userDepartment.userId })
    .from(userDepartment)
    .orderBy(asc(userDepartment.userId), asc(userDepartment.department));
  const memberships = new Map<string, Department[]>();

  for (const row of rows) {
    const departments = memberships.get(row.userId) ?? [];
    departments.push(Department.parse(row.department));
    memberships.set(row.userId, departments);
  }

  return {
    memberships: [...memberships].map(([userId, departments]) => ({ departments, userId: AuthId.parse(userId) })),
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

/** Department matches join the shared account search before pagination; EXISTS avoids duplicate people. */
export async function listEquipmentUsers({ db, input }: { db: Db; input: EquipmentUserListInput }) {
  const departmentLabel = sql`case ${userDepartment.department} ${sql.join(
    Object.entries(departmentLabels).map(([value, label]) => sql`when ${value} then ${label}`),
    sql` `,
  )} end`;
  const departmentMatch = (search: string) =>
    exists(
      db
        .select({ userId: userDepartment.userId })
        .from(userDepartment)
        .where(
          and(
            eq(userDepartment.userId, user.id),
            createGlobalSearchCondition(search, [sql`${userDepartment.department}`, departmentLabel]),
          ),
        ),
    );

  return listUsers({
    db,
    input: { ...input, business: 'equipment' },
    extraSearch: input.search ? departmentMatch(input.search) : undefined,
    extraFilter: input.department ? departmentMatch(input.department) : undefined,
  });
}
