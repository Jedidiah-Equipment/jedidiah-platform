import type { DatabaseTransaction } from '@pkg/db';
import { contractingHourReadings } from '@pkg/db/contracting';
import { meterDisagreementHint } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import { defineAuditDescriptor } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { ReadingError } from './reading-errors.js';

export type ReadingRow = typeof contractingHourReadings.$inferSelect;

export const readingNotFound = () => new ReadingError('reading.not_found', 'Hour Reading not found.');

export function withHint<T extends ReadingRow>(row: T) {
  return { ...row, aiHint: meterDisagreementHint(row) };
}

export const readingDescriptor = defineAuditDescriptor<ReadingRow>({
  entityType: 'contracting_reading',
  noun: 'Hour Reading',
  primaryLabelField: 'id',
  entityId: (row) => row.id,
  // Acceptance time never changes, so it stays out of the record like any row's own stamp.
  toRecord: ({ createdAt: _createdAt, ...row }) => ({
    ...row,
    capturedAt: row.capturedAt.toISOString(),
    amendedAt: row.amendedAt?.toISOString() ?? null,
    evidenceReviewedAt: row.evidenceReviewedAt?.toISOString() ?? null,
  }),
});

// The machine lock serializes captures and amendments. Pair resolution changes multiple rows in
// the same transaction, so each resulting row is diffed and audited after that resolution.
export async function updateAudited(
  tx: DatabaseTransaction,
  actorUserId: AuthId | null,
  before: ReadingRow,
  patch: Partial<Omit<ReadingRow, 'sequence'>>,
  summary?: string,
) {
  return mutateEntity({
    db: tx,
    actorUserId,
    descriptor: readingDescriptor,
    table: contractingHourReadings,
    id: before.id,
    notFound: readingNotFound,
    set: () => patch,
    ...(summary ? { summary } : {}),
    project: (_tx, row) => withHint(row),
  });
}
