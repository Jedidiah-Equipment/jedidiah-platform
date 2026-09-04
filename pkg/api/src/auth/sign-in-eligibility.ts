import { type Db, sql, user } from '@pkg/db';
import { isStoredUserSignInEligible } from '@pkg/domain';
import { AuthId } from '@pkg/schema';
import { APIError } from 'better-auth/api';

export const SIGN_IN_DISABLED_MESSAGE = 'This account is not enabled for sign-in.';

const SIGN_IN_DISABLED_ERROR = {
  code: 'ACCOUNT_SIGN_IN_DISABLED',
  message: SIGN_IN_DISABLED_MESSAGE,
} as const;

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

  if (!isStoredUserSignInEligible(targetUser)) {
    throw APIError.from('FORBIDDEN', SIGN_IN_DISABLED_ERROR);
  }
}
