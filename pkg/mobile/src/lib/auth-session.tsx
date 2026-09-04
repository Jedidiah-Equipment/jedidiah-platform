import { ContractingRole, EquipmentRole } from '@pkg/schema';
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

export function getSessionBusinessAccess(session: AuthSession) {
  const equipmentRole = EquipmentRole.nullable()
    .catch(null)
    .parse(session.user.role ?? null);
  const contractingRole = ContractingRole.nullable()
    .catch(null)
    .parse(session.user.contractingRole ?? null);
  const isSuperAdmin = equipmentRole === 'super-admin' || contractingRole === 'super-admin';

  return {
    contracting: isSuperAdmin || contractingRole !== null,
    equipment: isSuperAdmin || equipmentRole !== null,
  };
}
