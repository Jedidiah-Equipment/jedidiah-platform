import type { contractingBreakdowns } from '@pkg/db/contracting';
import { defineAuditDescriptor } from '../../audit/audit-writer.js';

export const breakdownDescriptor = defineAuditDescriptor<typeof contractingBreakdowns.$inferSelect>({
  entityType: 'contracting_breakdown',
  noun: 'Breakdown',
  primaryLabelField: 'id',
  label: (row) => row.id,
  entityId: (row) => row.id,
  toRecord: ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => ({
    ...row,
    reportedAt: row.reportedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    solvedAt: row.solvedAt?.toISOString() ?? null,
    photos: row.photos.map((photo) => photo.id),
  }),
});
