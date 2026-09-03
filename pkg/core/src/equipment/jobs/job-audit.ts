import { formatJobCode, JobCode } from '@pkg/schema';

import { defineAuditDescriptor } from '../audit/audit-service.js';
import type { JobRow } from './job-mappers.js';

/**
 * Lives apart from `job-service` so a writer outside Jobs can audit a Job without importing the Job
 * service itself — which reaches into Units to create them, and would make the import a cycle.
 */
export const jobAuditDescriptor = defineAuditDescriptor<JobRow>({
  entityType: 'job',
  noun: 'job',
  primaryLabelField: 'code',
  primaryLabelFormatter: formatJobAuditLabel,
  entityId: (row) => row.id,
  label: (row) => row.code,
  toRecord: (row) => ({
    cancellationReason: row.cancellationReason,
    completedOn: row.completedOn,
    description: row.description,
    productUnitId: row.productUnitId,
    quoteId: row.quoteId,
  }),
});

function formatJobAuditLabel(value: unknown): string {
  if (typeof value === 'number') {
    return formatJobCode(value);
  }

  const result = JobCode.safeParse(value);

  return result.success ? result.data : String(value);
}
