import type { contractingHourReadings } from '@pkg/db/contracting';

/** An Hour Reading row as the Job and field reads send it: ISO times. */
export function readingToWire(row: typeof contractingHourReadings.$inferSelect) {
  return {
    ...row,
    capturedAt: row.capturedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    amendedAt: row.amendedAt?.toISOString() ?? null,
  };
}
