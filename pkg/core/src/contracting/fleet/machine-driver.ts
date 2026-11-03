import type { Db } from '@pkg/db';
import { formatJobNumber, type JobActor } from '@pkg/domain/contracting';
import type { MachineDriverChangeInput, MachineDriverChangeResult } from '@pkg/schema/contracting';
import { changeStintDriver } from '../jobs/assignment-service.js';
import { patchMachine } from './machine-service.js';
import { onSiteAssignment } from './on-site-assignment.js';

/**
 * Sets a Machine's default Driver and, with `onSite`, the Driver of the stint it is on site on now, in one
 * transaction: the Machine locked first, then that stint's Job and the stint. A refused stint keeps its Driver while
 * the default still changes. The answer names the Job written, which the caller's screen may not have shown yet.
 */
export function changeMachineDriver({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: MachineDriverChangeInput;
}): Promise<MachineDriverChangeResult> {
  return db.transaction(async (tx) => {
    await patchMachine({
      db: tx,
      actorUserId: actor.userId,
      input: { id: input.machineId, currentDriverUserId: input.driverUserId },
    });
    const stint = input.onSite
      ? await onSiteAssignment({ db: tx, subject: { kind: 'machine', id: input.machineId } })
      : null;
    if (!stint) return { onSite: null };
    const refusal = await changeStintDriver(tx, actor, stint.stintId, input.driverUserId);
    return { onSite: { jobNumber: formatJobNumber(stint.jobCode), refusal } };
  });
}
