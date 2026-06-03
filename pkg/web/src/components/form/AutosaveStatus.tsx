import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon, RotateCcwIcon } from 'lucide-react';

import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import type { AutosaveControllerState } from './utils/autosave-core.js';

type AutosaveStatusProps = {
  state: AutosaveControllerState;
  onRetry?: () => void;
};

export function AutosaveStatus({ onRetry, state }: AutosaveStatusProps) {
  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'saving') {
    return (
      <Badge variant="outline">
        <Loader2Icon data-icon="inline-start" className="animate-spin" />
        Saving...
      </Badge>
    );
  }

  if (state.status === 'saved') {
    return (
      <Badge variant="secondary">
        <CheckCircle2Icon data-icon="inline-start" />
        Saved
      </Badge>
    );
  }

  return (
    <Alert className="items-center" variant="destructive">
      <AlertCircleIcon />
      <AlertDescription>{state.errorMessage ?? 'Unable to save changes.'}</AlertDescription>
      {state.status === 'error' && onRetry ? (
        <AlertAction>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            <RotateCcwIcon data-icon="inline-start" />
            Retry
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
