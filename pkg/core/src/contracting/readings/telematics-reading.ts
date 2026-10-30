import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingHourReadings, contractingJohnDeereLinks, contractingMachines } from '@pkg/db/contracting';
import { FUTURE_READ_AT_TOLERANCE_MS, floorToTenth } from '@pkg/domain/contracting';
import type { TelematicsProvider } from '@pkg/schema/contracting';
import { and, eq, isNull } from 'drizzle-orm';
import { recordAuditCreate } from '../../audit/audit-writer.js';
import { serviceDueSoonEdge } from '../fleet/machine-service.js';
import { type ReadingRow, readingDescriptor, updateAudited } from './reading-audit.js';
import { newestFirst, oldestFirst } from './reading-sql.js';

/** John Deere's latest report for a Machine; null for an unlinked Machine. */
export async function latestTelematicsReading(db: Db | DatabaseTransaction, machineId: string) {
  const [latest] = await db
    .select({ hours: contractingHourReadings.value, at: contractingHourReadings.capturedAt })
    .from(contractingHourReadings)
    .where(and(eq(contractingHourReadings.machineId, machineId), eq(contractingHourReadings.method, 'telematics')))
    .orderBy(...newestFirst)
    .limit(1);
  return latest ?? null;
}

/** John Deere's latest report for the Machine, as a capture screen shows it beside the hours; null when unlinked. */
export async function latestTelematics({ db, machineId }: { db: Db; machineId: string }) {
  const latest = await latestTelematicsReading(db, machineId);
  return latest ? { hours: latest.hours, at: latest.at.toISOString() } : null;
}

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
    };

/**
 * Writes what a Machine's telematics reported into its ledger: a new Telematics Reading, or the last one's Read At
 * moved forward when the same value is reported again and nothing else was read in between. It marks nothing: it joins
 * the ledger and moves Known Hours.
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
    const last = ledger.findLast((row) => row.method === 'telematics') ?? null;
    if (last && reportTime.getTime() <= last.capturedAt.getTime()) return { outcome: 'unchanged', reason: 'not-newer' };

    // The same value again, with nothing read since, is the same hours still standing: the Read At moves on.
    const readSince = (since: ReadingRow) =>
      ledger.some(
        (row) =>
          row.capturedAt.getTime() > since.capturedAt.getTime() && row.capturedAt.getTime() <= reportTime.getTime(),
      );
    const moving = last && last.value === value && !readSince(last) ? last : null;
    const edge = await serviceDueSoonEdge(tx, machine);
    const reading = moving
      ? await updateAudited(tx, null, moving, { capturedAt: reportTime }, 'Report time moved')
      : await insertTelematicsReading(tx, { machineId, linkId, provider, value, reportTime });

    return { outcome: moving ? 'moved' : 'stored', reading, serviceDueSoonCrossed: await edge.crossed() };
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
