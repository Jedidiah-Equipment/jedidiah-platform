import type { presentAction } from '@pkg/domain';
import { type ComponentProps, useId } from 'react';
import { Button } from '@/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

export type PresentedAction = NonNullable<ReturnType<typeof presentAction>>;

/**
 * A button for an action verdict (`presentAction`, `sheet.action(name)`). While the entity refuses the action it is
 * disabled, and its reason shows on a focusable wrapper: a disabled Button takes no pointer or focus. `disabled`
 * adds a local condition, such as an unmet gate, on top of the verdict.
 */
export function ActionButton({
  action,
  disabled = false,
  ...props
}: Omit<ComponentProps<typeof Button>, 'title'> & { action: PresentedAction }) {
  const reasonId = useId();
  const isDisabled = action.disabled || disabled;
  const reason = isDisabled ? action.title : undefined;
  if (!reason) return <Button {...props} disabled={isDisabled} />;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a disabled button cannot take focus, so its reason needs a focus stop
          <span aria-describedby={reasonId} className="inline-flex cursor-not-allowed" tabIndex={0} />
        }
      >
        <Button {...props} aria-describedby={reasonId} disabled />
        <span className="sr-only" id={reasonId}>
          {reason}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
