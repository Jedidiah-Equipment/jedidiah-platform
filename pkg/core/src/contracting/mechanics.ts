import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import type { AuthId, ContractingRole } from '@pkg/schema';
import { MECHANIC_ROLES, type Mechanic } from '@pkg/schema/contracting';
import { and, asc, eq, inArray } from 'drizzle-orm';

/** The people a workshop manager may assign: non-device users holding one of the {@link MECHANIC_ROLES}. */
export async function listMechanics({ db }: { db: Db }): Promise<Mechanic[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(inArray(user.contractingRole, MECHANIC_ROLES), eq(user.isDevice, false)))
    .orderBy(asc(user.name));
}

/** Refuses, with the caller's own error, unless this user is one {@link listMechanics} offers; the row is share-locked. */
export async function assertContractingMechanic(tx: DatabaseTransaction, userId: AuthId, refuse: () => Error) {
  const [person] = await tx
    .select({ role: user.contractingRole, isDevice: user.isDevice })
    .from(user)
    .where(eq(user.id, userId))
    .for('share');
  if (!isMechanicRole(person?.role) || person?.isDevice) throw refuse();
}

export const isMechanicRole = (role: ContractingRole | null | undefined) =>
  MECHANIC_ROLES.some((mechanicRole) => mechanicRole === role);
