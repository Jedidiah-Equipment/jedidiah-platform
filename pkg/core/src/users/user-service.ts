import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  type Db,
  getSortOrder,
  user,
  withPagination,
} from '@pkg/db';
import { roleLabels } from '@pkg/domain';
import {
  AuthId,
  type Business,
  ContractingRole,
  EquipmentRole,
  getNextCursor,
  NullablePhoneNumber,
  NullableThumbnailDataUrl,
  type UserAccount,
  type UserListInput,
  type UserListResult,
} from '@pkg/schema';
import { and, asc, eq, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';

import { defineAuditDescriptor } from '../audit/audit-writer.js';
import { mutateEntity } from '../audit/mutate-entity.js';
import { UserNotFoundError } from './user-errors.js';

type UserAuditInput = Pick<
  typeof user.$inferSelect,
  'id' | 'email' | 'image' | 'isDevice' | 'lastActivitySeen' | 'phoneNumber'
>;

// `email` is the summary label, not an audited field on these paths, so it lives in `label` rather
// than `toRecord`. Department membership audits its own changes in the equipment user service.
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

export type UserAccountRow = Pick<
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

export function mapUserAccount(row: UserAccountRow): UserAccount {
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

const userAccountColumns = {
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
};

export async function getUserById({ db, userId }: { db: Db; userId: AuthId }): Promise<UserAccount> {
  const [row] = await db.select(userAccountColumns).from(user).where(eq(user.id, userId)).limit(1);

  if (!row) {
    throw new UserNotFoundError(userId);
  }

  return mapUserAccount(row);
}

/**
 * Who belongs in a business's user admin: anyone holding that business's role — super-admin is
 * stored once in the equipment slot and spans both (ADR 0017) — and anyone holding no role at all,
 * who belongs to neither business and would otherwise be reachable from nowhere.
 */
export function userBusinessMembership(business: Business | undefined): SQL | undefined {
  const holdsNoRole = and(isNull(user.role), isNull(user.contractingRole));

  switch (business) {
    case undefined:
      return undefined;
    case 'equipment':
      return or(isNotNull(user.role), holdsNoRole);
    case 'contracting':
      return or(isNotNull(user.contractingRole), eq(user.role, 'super-admin'), holdsNoRole);
  }
}

/** Business-owned search/filter predicates are applied before counting and paging account rows. */
export async function listUsers({
  db,
  input,
  extraSearch,
  extraFilter,
}: {
  db: Db;
  input: UserListInput;
  extraSearch?: SQL | undefined;
  extraFilter?: SQL | undefined;
}): Promise<UserListResult> {
  const role =
    input.business === 'contracting'
      ? sql`case when ${user.role} = 'super-admin' then ${user.role} else ${user.contractingRole} end`
      : sql`${user.role}`;
  const roleLabel = sql`case ${role} ${sql.join(
    Object.entries(roleLabels).map(([value, label]) => sql`when ${value} then ${label}`),
    sql` `,
  )} else 'No access' end`;
  const emailStatus = sql`case when ${user.emailVerified} then 'Verified' else 'Unverified' end`;
  const filters = input.columnFilters;
  const where = and(
    userBusinessMembership(input.business),
    input.search
      ? or(
          createGlobalSearchCondition(input.search, [
            sql`${user.name}`,
            sql`${user.email}`,
            role,
            roleLabel,
            emailStatus,
          ]),
          extraSearch,
        )
      : undefined,
    filters.name ? createEscapedContainsSearchCondition(sql`${user.name}`, filters.name) : undefined,
    filters.role ? createGlobalSearchCondition(filters.role, [role, roleLabel]) : undefined,
    filters.emailVerified ? createEscapedContainsSearchCondition(emailStatus, filters.emailVerified) : undefined,
    extraFilter,
  );
  const sortColumns = { name: user.name, email: user.email, emailVerified: user.emailVerified, role };
  const query = db
    .select(userAccountColumns)
    .from(user)
    .where(where)
    .orderBy(getSortOrder(sortColumns[input.sortBy], input.sortDirection), asc(user.id))
    .$dynamic();
  const [rows, total] = await Promise.all([withPagination(query, input), db.$count(user, where)]);
  const items = rows.map(mapUserAccount);

  return { items, total, nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }) };
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
