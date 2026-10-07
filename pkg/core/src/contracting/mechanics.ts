import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import type { AuthId } from '@pkg/schema';
import type { Mechanic } from '@pkg/schema/contracting';
import { and, asc, eq } from 'drizzle-orm';

/** The people a workshop manager may assign: non-device users with the Contracting mechanic role. */
export async function listMechanics({ db }: { db: Db }): Promise<Mechanic[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.contractingRole, 'mechanic'), eq(user.isDevice, false)))
    .orderBy(asc(user.name));
}

/** Refuses, with the caller's own error, unless this user is a non-device Mechanic; the row is share-locked. */
export async function assertContractingMechanic(tx: DatabaseTransaction, userId: AuthId, refuse: () => Error) {
  const [person] = await tx
    .select({ role: user.contractingRole, isDevice: user.isDevice })
    .from(user)
    .where(eq(user.id, userId))
    .for('share');
  if (person?.role !== 'mechanic' || person.isDevice) throw refuse();
}
