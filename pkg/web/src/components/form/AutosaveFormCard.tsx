import type { AutosaveControllerState } from '@pkg/domain';
import type React from 'react';
import { EditFormGrid } from '@/components/page-layout/EditFormLayout.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { AutosaveStatus } from './AutosaveStatus.js';

type AutosaveFormCardProps = {
  autosave: { state: AutosaveControllerState; retry: () => Promise<unknown> };
  children: React.ReactNode;
  disabled: boolean;
  formProps: React.ComponentProps<'form'>;
};

/** The standard autosaving edit form: status above a card whose fields lock together when editing is not allowed. */
export function AutosaveFormCard({ autosave, children, disabled, formProps }: AutosaveFormCardProps) {
  return (
    <form {...formProps} className="flex flex-col gap-4">
      <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
      <Card>
        <CardContent>
          <fieldset disabled={disabled}>
            <EditFormGrid>{children}</EditFormGrid>
          </fieldset>
        </CardContent>
      </Card>
    </form>
  );
}
