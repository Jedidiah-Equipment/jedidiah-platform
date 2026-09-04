import { UserPassword } from '@pkg/schema';

/** Every seeded user, in either business, signs in with this password. */
export const DEFAULT_DEMO_USER_PASSWORD: UserPassword = UserPassword.parse('stoneybrook');
