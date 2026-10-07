import type { Db } from '@pkg/db';
import type { AuthId, ContractingRole } from '@pkg/schema';
import { isBreakdownError } from './breakdowns/breakdown-errors.js';
import { assertMechanicAccountChangeAllowed } from './breakdowns/breakdown-service.js';
import { isFleetError } from './fleet/fleet-errors.js';
import { assertDriverAccountChangeAllowed } from './fleet/machine-service.js';

export type ContractingAccountChange = {
  db: Db;
  userId: AuthId;
  contractingRole?: ContractingRole | null | undefined;
  isDevice?: boolean | undefined;
};

/**
 * Refuses a role or device change that would strand work the person still holds in Contracting: a Driver's
 * Machines, a Mechanic's unsolved Breakdowns. Each holder's rule lives with its feature; this is the one
 * gate the auth plugin calls.
 */
export async function assertContractingAccountChangeAllowed(change: ContractingAccountChange): Promise<void> {
  await Promise.all([assertDriverAccountChangeAllowed(change), assertMechanicAccountChangeAllowed(change)]);
}

/** The refusals {@link assertContractingAccountChangeAllowed} raises, each carrying a code and a sentence. */
export const isContractingAccountChangeRefusal = (error: unknown): error is Error & { code: string } =>
  isFleetError(error) || isBreakdownError(error);
