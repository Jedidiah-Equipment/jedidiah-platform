import { type Db, sql, user } from '@pkg/db';
import { isRoleSignInEligible } from '@pkg/domain';
import { AppRole, type AppRole as AppRoleType, AuthId } from '@pkg/schema';
import { APIError } from 'better-auth/api';

export const SIGN_IN_DISABLED_MESSAGE = 'This account is not enabled for sign-in.';

const SIGN_IN_DISABLED_ERROR = {
  code: 'ACCOUNT_SIGN_IN_DISABLED',
  message: SIGN_IN_DISABLED_MESSAGE,
} as const;

export function parseBetterAuthRole(role: unknown): AppRoleType {
  return AppRole.parse(Array.isArray(role) ? role[0] : role);
}

export async function assertUserCanCreateSession({ db, userId }: { db: Db; userId: string }): Promise<void> {
  const [targetUser] = await db
    .select({
      role: user.role,
    })
    .from(user)
    .where(sql`${user.id} = ${AuthId.parse(userId)}`)
    .limit(1);

  if (!targetUser) {
    return;
  }

  if (!isBetterAuthRoleSignInEligible(targetUser.role)) {
    throw APIError.from('FORBIDDEN', SIGN_IN_DISABLED_ERROR);
  }
}

// Eligibility fails closed: a role we cannot parse is treated as ineligible rather than an error.
export function isBetterAuthRoleSignInEligible(role: unknown): boolean {
  const parsed = AppRole.safeParse(Array.isArray(role) ? role[0] : role);

  return parsed.success && isRoleSignInEligible(parsed.data);
}
