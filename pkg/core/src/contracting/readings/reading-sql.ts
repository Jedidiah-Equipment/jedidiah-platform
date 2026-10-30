import { contractingHourReadings } from '@pkg/db/contracting';
import { asc, desc, sql } from 'drizzle-orm';

/** Read At orders a Machine's ledger; acceptance breaks a tie. */
export const oldestFirst = [asc(contractingHourReadings.capturedAt), asc(contractingHourReadings.sequence)] as const;
export const newestFirst = [desc(contractingHourReadings.capturedAt), desc(contractingHourReadings.sequence)] as const;

/** The rows after `row` in ledger order, a Read At tie broken by acceptance. */
export const afterInLedger = (row: { capturedAt: Date; sequence: number }) =>
  sql`(${contractingHourReadings.capturedAt}, ${contractingHourReadings.sequence}) > (${row.capturedAt.toISOString()}::timestamptz, ${row.sequence})`;
