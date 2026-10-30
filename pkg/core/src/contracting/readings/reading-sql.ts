import { contractingHourReadings } from '@pkg/db/contracting';
import { asc, desc } from 'drizzle-orm';

/** Read At orders a Machine's ledger; acceptance breaks a tie. */
export const oldestFirst = [asc(contractingHourReadings.capturedAt), asc(contractingHourReadings.sequence)] as const;
export const newestFirst = [desc(contractingHourReadings.capturedAt), desc(contractingHourReadings.sequence)] as const;
