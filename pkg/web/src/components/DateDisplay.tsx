import { differenceInSeconds, isWithinInterval, subWeeks } from 'date-fns';
import type React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { cn } from '@/lib/utils.js';
import { type DateFormat, formatDate, parseDate, secondsToAgeString } from '@/utils/date.js';

type DateDisplayParts = {
  label: string;
  tooltip: string | null;
};

export type DateDisplayProps = Omit<React.ComponentPropsWithoutRef<'span'>, 'children'> & {
  date?: Date | string | number | null;
  emptyValue?: string | undefined;
  format?: DateFormat;
};

export const DateDisplay: React.FC<DateDisplayProps> = ({
  className,
  date,
  emptyValue,
  format = 'short',
  ...props
}) => {
  const display = getDateDisplayParts({ date, emptyValue, format });

  if (!display.tooltip) {
    return (
      <span className={className} {...props}>
        {display.label}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn('cursor-help decoration-dotted underline-offset-2 hover:underline', className)}
            {...props}
          >
            {display.label}
          </span>
        }
      />
      <TooltipContent>{display.tooltip}</TooltipContent>
    </Tooltip>
  );
};

export function getDateDisplayParts({
  date,
  emptyValue,
  format = 'short',
  now = new Date(),
}: {
  date?: Date | string | number | null | undefined;
  emptyValue?: string | undefined;
  format?: DateFormat;
  now?: Date;
}): DateDisplayParts {
  const parsedDate = parseDate(date);

  if (!parsedDate) {
    return {
      label: emptyValue ?? '',
      tooltip: null,
    };
  }

  if (isWithinRecentDateWindow(parsedDate, now)) {
    const duration = secondsToAgeString(
      Math.max(
        differenceInSeconds(now, parsedDate, {
          roundingMethod: 'floor',
        }),
        1,
      ),
    ).trim();

    return {
      label: `${duration} ago`,
      tooltip: formatDate(parsedDate, 'medium'),
    };
  }

  return {
    label: formatDate(parsedDate, format, emptyValue),
    tooltip: null,
  };
}

function isWithinRecentDateWindow(date: Date, now: Date): boolean {
  return isWithinInterval(date, {
    end: now,
    start: subWeeks(now, 1),
  });
}
