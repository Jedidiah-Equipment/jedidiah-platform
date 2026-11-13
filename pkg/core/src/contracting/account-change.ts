import type { Db } from '@pkg/db';
import type { AuthId, ContractingRole } from '@pkg/schema';
import { isBreakdownError } from './breakdowns/breakdown-errors.js';
import { isFleetError } from './fleet/fleet-errors.js';
import { assertDriverAccountChangeAllowed } from './fleet/machine-service.js';
import { isJobError } from './jobs/job-errors.js';
import { assertJobHolderLeavingAllowed } from './jobs/job-read.js';
import { assertMechanicAccountChangeAllowed } from './mechanics.js';

export type ContractingAccountChange = {
  db: Db;
  userId: AuthId;
  contractingRole?: ContractingRole | null | undefined;
  isDevice?: boolean | undefined;
  /** Disable or Remove: the person leaves every role, so open Jobs and Machine Assignments they hold also refuse. */
  leaving?: boolean | undefined;
};

/**
 * Refuses a role or device change, or a Disable or Remove (`leaving`), that would strand work the person still holds
 * in Contracting: a Driver's Machines, a Mechanic's unsolved Breakdowns and open Service Records, and when leaving a
 * Foreman's open Jobs and a Driver's open Machine Assignments (a role change meets those in the database triggers).
 * Each holder's rule lives with its set; this is the one gate the auth plugins call.
 */
export async function assertContractingAccountChangeAllowed(change: ContractingAccountChange): Promise<void> {
  await Promise.all([
    assertDriverAccountChangeAllowed(change),
    assertMechanicAccountChangeAllowed(change),
    change.leaving ? assertJobHolderLeavingAllowed(change) : undefined,
  ]);
}

/** The refusals {@link assertContractingAccountChangeAllowed} raises, each carrying a code and a sentence. */
export const isContractingAccountChangeRefusal = (error: unknown): error is Error & { code: string } =>
  isFleetError(error) || isBreakdownError(error) || isJobError(error);
