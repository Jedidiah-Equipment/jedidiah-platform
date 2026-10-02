import type { contractingHourReadings } from '@pkg/db/contracting';
import { meterDisagreementHint } from '@pkg/domain/contracting';

/** An Hour Reading row as the Job and field reads send it: ISO times, the tenths hint, whether a photo backs it. */
export function readingToWire(row: typeof contractingHourReadings.$inferSelect) {
  return {
    ...row,
    capturedAt: row.capturedAt.toISOString(),
    evidenceReviewedAt: row.evidenceReviewedAt?.toISOString() ?? null,
    amendedAt: row.amendedAt?.toISOString() ?? null,
    aiHint: meterDisagreementHint(row),
    photoBacked: row.photo !== null,
  };
}
