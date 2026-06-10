import { type Db, sql, user } from '@pkg/db';
import { isRoleSignInEligible } from '@pkg/domain';
import { AppRole, AuthId } from '@pkg/schema';
import { APIError } from 'better-auth/api';

export const SIGN_IN_DISABLED_MESSAGE = 'This account is not enabled for sign-in.';

const SIGN_IN_DISABLED_ERROR = {
  code: 'ACCOUNT_SIGN_IN_DISABLED',
  message: SIGN_IN_DISABLED_MESSAGE,
} as const;

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

  if (!isRoleSignInEligible(AppRole.parse(targetUser.role))) {
    throw APIError.from('FORBIDDEN', SIGN_IN_DISABLED_ERROR);
  }
}

export function isSessionRoleSignInEligible(role: unknown): boolean {
  return isRoleSignInEligible(AppRole.parse(Array.isArray(role) ? role[0] : role));
}
