import { type AutosaveControllerState, getFormIssueMessages } from '@pkg/domain';
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

  // Naming the broken rules matters most for the ones no field can highlight: a cross-field rule
  // such as a duplicate part belongs to the array, not to either row that breaks it.
  const messages = getFormIssueMessages(state.issues);

  return (
    <Alert className="flex items-start gap-2" variant="destructive">
      <IconAlertCircle className="shrink-0 translate-y-0!" />
      <AlertDescription className="leading-5">
        {state.errorMessage ?? 'Unable to save changes.'}
        {messages.length > 0 ? (
          <ul className="mt-1 list-disc ps-5">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
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
