import type { AutosaveControllerState } from '@pkg/domain';
import { IconAlertCircle, IconRotate } from '@tabler/icons-react';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';

type AutosaveStatusProps = {
  state: AutosaveControllerState;
  onRetry?: () => void;
};

export function AutosaveStatus({ onRetry, state }: AutosaveStatusProps) {
  if (state.status !== 'invalid' && state.status !== 'error') {
    return null;
  }

  return (
    <Alert className="flex items-center gap-2" variant="destructive">
      <IconAlertCircle className="shrink-0 translate-y-0!" />
      <AlertDescription className="leading-5">{state.errorMessage ?? 'Unable to save changes.'}</AlertDescription>
      {state.status === 'error' && onRetry ? (
        <AlertAction>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            <IconRotate data-icon="inline-start" />
            Retry
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
