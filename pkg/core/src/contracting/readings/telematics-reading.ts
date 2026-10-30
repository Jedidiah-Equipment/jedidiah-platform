import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingHourReadings, contractingJohnDeereLinks, contractingMachines } from '@pkg/db/contracting';
import {
  effectiveServiceAlertHours,
  FUTURE_READ_AT_TOLERANCE_MS,
  floorToTenth,
  readingsContradictedBy,
  serviceDueSoonCrossed,
  telematicsDisputeReason,
} from '@pkg/domain/contracting';
import type { TelematicsProvider } from '@pkg/schema/contracting';
import { and, eq, isNull } from 'drizzle-orm';
import { recordAuditCreate } from '../../audit/audit-writer.js';
import { getContractingSettings } from '../settings/settings-service.js';
import { type ReadingRow, readingDescriptor, updateAudited } from './reading-audit.js';
import { oldestFirst } from './reading-sql.js';

export type TelematicsReadingResult =
  | {
      outcome: 'unchanged';
      reason: 'future-report-time' | 'not-newer' | 'machine-retired' | 'machine-not-found' | 'link-not-active';
    }
  | {
      outcome: 'stored' | 'moved';
      reading: ReadingRow;
      /** True when this write took the Machine into Service Due Soon; the caller schedules the push after commit. */
      serviceDueSoonCrossed: boolean;
      /** Captured readings the Telematics Reading contradicts, now Disputed for management. */
      disputedReadingIds: string[];
    };

/**
 * Writes what a Machine's telematics reported into its ledger: a new Telematics Reading, or the last one's Read At
 * moved forward when the same value is reported again and nothing else was read in between. A captured reading the
 * report leaves out of sequence becomes Disputed for management; the report itself is beyond dispute.
 */
export async function recordTelematicsReading({
  db,
  machineId,
  linkId,
  provider,
  hours,
  reportTime,
  now = new Date(),
}: {
  db: Db;
  machineId: string;
  linkId: string;
  provider: TelematicsProvider;
  hours: number;
  reportTime: Date;
  now?: Date;
}): Promise<TelematicsReadingResult> {
  if (reportTime.getTime() > now.getTime() + FUTURE_READ_AT_TOLERANCE_MS)
    return { outcome: 'unchanged', reason: 'future-report-time' };
  const value = floorToTenth(hours);
  return db.transaction(async (tx): Promise<TelematicsReadingResult> => {
    const [machine] = await tx
      .select()
      .from(contractingMachines)
      .where(eq(contractingMachines.id, machineId))
      .for('update');
    if (!machine) return { outcome: 'unchanged', reason: 'machine-not-found' };
    if (machine.retiredAt) return { outcome: 'unchanged', reason: 'machine-retired' };
    // An administrator may unlink while Deere's answer was in flight; Unlink locks the Link row, so this waits or sees it.
    const [link] = await tx
      .select({ id: contractingJohnDeereLinks.id })
      .from(contractingJohnDeereLinks)
      .where(and(eq(contractingJohnDeereLinks.id, linkId), isNull(contractingJohnDeereLinks.unlinkedAt)))
      .for('share');
    if (!link) return { outcome: 'unchanged', reason: 'link-not-active' };

    const ledger = await tx
      .select()
      .from(contractingHourReadings)
      .where(eq(contractingHourReadings.machineId, machineId))
      .orderBy(...oldestFirst);
    const latest = ledger.at(-1) ?? null;
    const last = ledger.findLast((row) => row.method === 'telematics') ?? null;
    if (last && reportTime.getTime() <= last.capturedAt.getTime()) return { outcome: 'unchanged', reason: 'not-newer' };

    // The same value again, with nothing read since, is the same hours still standing: the Read At moves on.
    const readSince = (since: ReadingRow) =>
      ledger.some(
        (row) =>
          row.capturedAt.getTime() > since.capturedAt.getTime() && row.capturedAt.getTime() <= reportTime.getTime(),
      );
    const moving = last && last.value === value && !readSince(last) ? last : null;
    const reading = moving
      ? await updateAudited(tx, null, moving, { capturedAt: reportTime }, 'Report time moved')
      : await insertTelematicsReading(tx, { machineId, linkId, provider, value, reportTime });

    const after: ReadingRow[] = moving
      ? ledger.map((row) => (row.id === moving.id ? { ...row, capturedAt: reportTime } : row))
      : [...ledger, reading];
    const contradicted = readingsContradictedBy(after, reading.id).filter((row) => !row.disputed);
    for (const row of contradicted)
      await updateAudited(tx, null, row, {
        disputed: true,
        disputeReason: telematicsDisputeReason({ telematicsProvider: provider, value, capturedAt: reportTime }),
      });

    // Only a report that becomes the Machine's latest reading can bring it into Service Due Soon.
    const becameLatest = !latest || reportTime.getTime() >= latest.capturedAt.getTime();
    const crossed =
      becameLatest &&
      serviceDueSoonCrossed({
        previousHours: latest?.value ?? null,
        newHours: value,
        nextServiceDueHours: machine.nextServiceDueHours,
        threshold: effectiveServiceAlertHours(
          machine,
          (await getContractingSettings({ db: tx })).serviceDueSoonThresholdHours,
        ),
      });
    return {
      outcome: moving ? 'moved' : 'stored',
      reading,
      serviceDueSoonCrossed: crossed,
      disputedReadingIds: contradicted.map((row) => row.id),
    };
  });
}

async function insertTelematicsReading(
  tx: DatabaseTransaction,
  {
    machineId,
    linkId,
    provider,
    value,
    reportTime,
  }: { machineId: string; linkId: string; provider: TelematicsProvider; value: number; reportTime: Date },
) {
  const [row] = await tx
    .insert(contractingHourReadings)
    .values({
      machineId,
      role: 'spot',
      value,
      capturedAt: reportTime,
      capturedByUserId: null,
      method: 'telematics',
      telematicsProvider: provider,
      telematicsLinkId: linkId,
    })
    .returning();
  if (!row) throw new Error('Telematics reading insert returned no row');
  await recordAuditCreate({ db: tx, actorUserId: null, descriptor: readingDescriptor, input: row });
  return row;
}
