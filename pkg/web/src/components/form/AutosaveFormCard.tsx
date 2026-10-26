import type { AutosaveControllerState } from '@pkg/domain';
import type React from 'react';
import { EditFormGrid } from '@/components/page-layout/EditFormLayout.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { AutosaveStatus } from './AutosaveStatus.js';

type AutosaveFormFieldsProps = {
  children: React.ReactNode;
  disabled: boolean;
  formProps: React.ComponentProps<'form'>;
};

function LockedEditGrid({ children, disabled }: Pick<AutosaveFormFieldsProps, 'children' | 'disabled'>) {
  return (
    <fieldset disabled={disabled}>
      <EditFormGrid>{children}</EditFormGrid>
    </fieldset>
  );
}

/**
 * More fields of an autosave form, on a card of their own: the same edit grid and lock as `AutosaveFormCard`, with the
 * status left to that card.
 */
export function AutosaveFormFields({ children, disabled, formProps }: AutosaveFormFieldsProps) {
  return (
    <form {...formProps}>
      <LockedEditGrid disabled={disabled}>{children}</LockedEditGrid>
    </form>
  );
}

type AutosaveFormCardProps = AutosaveFormFieldsProps & {
  autosave: { state: AutosaveControllerState; retry: () => Promise<unknown> };
};

/** The standard autosaving edit form: status above a card whose fields lock together when editing is not allowed. */
export function AutosaveFormCard({ autosave, children, disabled, formProps }: AutosaveFormCardProps) {
  return (
    <form {...formProps} className="flex flex-col gap-4">
      <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
      <Card>
        <CardContent>
          <LockedEditGrid disabled={disabled}>{children}</LockedEditGrid>
        </CardContent>
      </Card>
    </form>
  );
}
