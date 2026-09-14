import { type Db, user } from '@pkg/db';
import {
  AuthId,
  type Business,
  ContractingRole,
  EquipmentRole,
  NullablePhoneNumber,
  NullableThumbnailDataUrl,
  type UserAccount,
  type UserListResult,
} from '@pkg/schema';
import { asc, eq, isNotNull, isNull, or, type SQL } from 'drizzle-orm';

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
function businessMembership(business: Business): SQL | undefined {
  switch (business) {
    case 'equipment':
      return or(isNotNull(user.role), isNull(user.contractingRole));
    case 'contracting':
      return or(isNotNull(user.contractingRole), isNull(user.role), eq(user.role, 'super-admin'));
  }
}

export async function listUsers({ business, db }: { business: Business; db: Db }): Promise<UserListResult> {
  const rows = await db
    .select(userAccountColumns)
    .from(user)
    .where(businessMembership(business))
    .orderBy(asc(user.email));

  return { users: rows.map(mapUserAccount) };
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
