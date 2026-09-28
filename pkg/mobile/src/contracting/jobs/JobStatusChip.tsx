import { jobStatusColorClassNames, jobStatusLabels } from '@pkg/domain/contracting';
import type { JobStatus } from '@pkg/schema/contracting';

import { StatusBadge } from '@/components/ui/status-badge';

export function JobStatusChip({ status }: { status: JobStatus }) {
  return <StatusBadge classNames={jobStatusColorClassNames[status]} label={jobStatusLabels[status]} />;
}
