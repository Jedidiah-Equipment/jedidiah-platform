import type { JobLifecycleStatus } from '@pkg/schema';
import { PauseIcon, RotateCcwIcon, XCircleIcon } from 'lucide-react';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { JobLifecycleStatusBadge } from '../../jobs/components/JobLifecycleStatusBadge.js';

type LifecycleControlsProps = {
  isPending: boolean;
  lifecycleStatus: JobLifecycleStatus;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
};

export const LifecycleControls: React.FC<LifecycleControlsProps> = ({
  isPending,
  lifecycleStatus,
  onCancel,
  onPause,
  onResume,
}) => {
  const isTerminal = lifecycleStatus === 'complete' || lifecycleStatus === 'cancelled';

  return (
    <section className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium">Lifecycle controls</div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Current status:
            <JobLifecycleStatusBadge status={lifecycleStatus} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isPending || lifecycleStatus !== 'active'}
            onClick={onPause}
            size="sm"
            type="button"
            variant="outline"
          >
            <PauseIcon data-icon="inline-start" />
            Pause
          </Button>
          <Button
            disabled={isPending || lifecycleStatus !== 'paused'}
            onClick={onResume}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcwIcon data-icon="inline-start" />
            Resume
          </Button>
          <Button disabled={isPending || isTerminal} onClick={onCancel} size="sm" type="button" variant="destructive">
            <XCircleIcon data-icon="inline-start" />
            Cancel
          </Button>
        </div>
      </div>
    </section>
  );
};
