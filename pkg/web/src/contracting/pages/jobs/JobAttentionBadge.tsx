import { countPhrase } from '@pkg/domain';
import { assignmentAttentionLevelColorClassNames, countedAssignmentAttentionLevel } from '@pkg/domain/contracting';
import type { JobSummary } from '@pkg/schema/contracting';
import { IconAlertTriangle } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

/** A Job's Machine Assignment attention that needs a look, at its loudest level; "No issues" when none. */
export function JobAttentionBadge({ attention }: { attention: JobSummary['assignmentAttention'] }) {
  const level = countedAssignmentAttentionLevel(attention);
  if (!level) return <span className="text-muted-foreground">No issues</span>;
  return (
    <Badge
      className={cn(
        assignmentAttentionLevelColorClassNames[level].chip,
        assignmentAttentionLevelColorClassNames[level].text,
      )}
      variant="outline"
    >
      <IconAlertTriangle aria-hidden="true" />
      {countPhrase(attention.critical + attention.warning, 'item', 'items')} to review
    </Badge>
  );
}
