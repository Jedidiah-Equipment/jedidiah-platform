import { type RoleSlots, tryParseRoleSlots } from '@pkg/domain';
import { createContext, type ReactNode, useContext } from 'react';

import type { AuthSession } from './auth';

// Populated by the protected route layout once it has a resolved session, so
// screens inside the protected tree read a guaranteed-non-null session without
// repeating their own loading/redirect guards.
const AuthSessionContext = createContext<AuthSession | null>(null);

export function AuthSessionProvider({ children, session }: { children: ReactNode; session: AuthSession }) {
  return <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSession {
  const session = useContext(AuthSessionContext);

  if (!session) {
    throw new Error('useAuthSession must be used within a protected route');
  }

  return session;
}

// The session's role slots for the domain business predicates; null when the roles do not parse.
export function getSessionRoleSlots(session: AuthSession): RoleSlots | null {
  return tryParseRoleSlots(session.user);
}
