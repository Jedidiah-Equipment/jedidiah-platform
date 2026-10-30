import { countPhrase } from '@pkg/domain';
import { needsALookColorClassNames } from '@pkg/domain/contracting';
import type { JobSummary } from '@pkg/schema/contracting';
import { IconAlertTriangle } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

/** How many of a Job's Machine Assignments need a look; "No issues" when none. */
export function JobAttentionBadge({ attention }: { attention: JobSummary['assignmentAttention'] }) {
  if (attention === 0) return <span className="text-muted-foreground">No issues</span>;
  return (
    <Badge className={cn(needsALookColorClassNames.chip, needsALookColorClassNames.text)} variant="outline">
      <IconAlertTriangle aria-hidden="true" />
      {countPhrase(attention, 'Machine needs', 'Machines need')} a look
    </Badge>
  );
}
