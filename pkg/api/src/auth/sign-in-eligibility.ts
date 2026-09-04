import { type Db, sql, user } from '@pkg/db';
import { isRoleSlotsSignInEligible } from '@pkg/domain';
import {
  AuthId,
  ContractingRole,
  type ContractingRole as ContractingRoleType,
  EquipmentRole,
  type EquipmentRole as EquipmentRoleType,
} from '@pkg/schema';
import { APIError } from 'better-auth/api';

export const SIGN_IN_DISABLED_MESSAGE = 'This account is not enabled for sign-in.';

const SIGN_IN_DISABLED_ERROR = {
  code: 'ACCOUNT_SIGN_IN_DISABLED',
  message: SIGN_IN_DISABLED_MESSAGE,
} as const;

export function parseBetterAuthRole(role: unknown): EquipmentRoleType {
  return EquipmentRole.parse(Array.isArray(role) ? role[0] : role);
}

export function parseBetterAuthRoleSlots(input: { contractingRole?: unknown; role?: unknown }): {
  contractingRole: ContractingRoleType | null;
  equipmentRole: EquipmentRoleType | null;
} {
  const equipmentRole = EquipmentRole.nullable().parse(
    (Array.isArray(input.role) ? input.role[0] : input.role) ?? null,
  );
  const contractingRole = ContractingRole.nullable().parse(input.contractingRole ?? null);

  if (equipmentRole === 'super-admin' || contractingRole === 'super-admin') {
    return { contractingRole: 'super-admin', equipmentRole: 'super-admin' };
  }

  return { contractingRole, equipmentRole };
}

export async function assertUserCanCreateSession({ db, userId }: { db: Db; userId: string }): Promise<void> {
  const [targetUser] = await db
    .select({
      contractingRole: user.contractingRole,
      role: user.role,
    })
    .from(user)
    .where(sql`${user.id} = ${AuthId.parse(userId)}`)
    .limit(1);

  if (!targetUser) {
    return;
  }

  if (!isBetterAuthRoleSignInEligible(targetUser.role, targetUser.contractingRole)) {
    throw APIError.from('FORBIDDEN', SIGN_IN_DISABLED_ERROR);
  }
}

// Eligibility fails closed: a role we cannot parse is treated as ineligible rather than an error.
export function isBetterAuthRoleSignInEligible(role: unknown, contractingRole: unknown = null): boolean {
  const parsed = parseRoleSlotsSafely({ contractingRole, role });

  return parsed !== null && isRoleSlotsSignInEligible(parsed);
}

function parseRoleSlotsSafely(input: { contractingRole?: unknown; role?: unknown }) {
  try {
    return parseBetterAuthRoleSlots(input);
  } catch {
    return null;
  }
}
