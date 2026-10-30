import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import { contractingBreakdowns, contractingServiceRecords } from '@pkg/db/contracting';
import type { AuthId, ContractingRole } from '@pkg/schema';
import { isMechanicRole, MECHANIC_ROLES, type Mechanic } from '@pkg/schema/contracting';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { BreakdownError } from './breakdowns/breakdown-errors.js';
import { unsolvedBreakdown } from './breakdowns/breakdown-load.js';
import { serviceRecordStatusCondition } from './services/service-record-status.js';

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

/** Refuses a role or device change that would take someone out of the set while they hold unsolved Breakdowns or open Service Records. */
export async function assertMechanicAccountChangeAllowed({
  db,
  userId,
  contractingRole,
  isDevice,
}: {
  db: Db;
  userId: AuthId;
  contractingRole?: ContractingRole | null | undefined;
  isDevice?: boolean | undefined;
}) {
  if ((contractingRole === undefined || isMechanicRole(contractingRole)) && isDevice !== true) return;
  const [[breakdown], [serviceRecord]] = await Promise.all([
    db
      .select({ id: contractingBreakdowns.id })
      .from(contractingBreakdowns)
      .where(and(eq(contractingBreakdowns.primaryMechanicUserId, userId), unsolvedBreakdown))
      .limit(1),
    db
      .select({ id: contractingServiceRecords.id })
      .from(contractingServiceRecords)
      .where(and(eq(contractingServiceRecords.primaryMechanicUserId, userId), serviceRecordStatusCondition('open')))
      .limit(1),
  ]);
  if (breakdown || serviceRecord)
    throw new BreakdownError(
      'breakdown.invalid_mechanic',
      "Reassign this mechanic's Breakdowns that are not yet Fixed and open Service Records before changing their role.",
    );
}
