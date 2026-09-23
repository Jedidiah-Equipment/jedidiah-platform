import type { contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import { formatJobNumber } from '@pkg/domain/contracting';
import { defineAuditDescriptor } from '../../audit/audit-writer.js';

export const jobDescriptor = defineAuditDescriptor<typeof contractingJobs.$inferSelect>({
  entityType: 'contracting_job',
  noun: 'Job',
  primaryLabelField: 'code',
  primaryLabelFormatter: (value) => formatJobNumber(Number(value)),
  entityId: (row) => row.id,
  toRecord: ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => ({
    ...row,
    completedAt: row.completedAt?.toISOString() ?? null,
    pricedAt: row.pricedAt?.toISOString() ?? null,
    reopenedAt: row.reopenedAt?.toISOString() ?? null,
    invoicedAt: row.invoicedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  }),
});

export const assignmentDescriptor = (machineCode: string) =>
  defineAuditDescriptor<typeof contractingMachineAssignments.$inferSelect>({
    entityType: 'contracting_assignment',
    noun: 'Machine Assignment',
    primaryLabelField: 'machineCode',
    label: () => machineCode,
    entityId: (row) => row.id,
    toRecord: ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => ({
      ...row,
      gapResolvedAt: row.gapResolvedAt?.toISOString() ?? null,
    }),
  });
