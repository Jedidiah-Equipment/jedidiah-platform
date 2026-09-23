import { type DateFormat, getDateDisplayParts } from '@pkg/domain';
import { useState } from 'react';

import { type AppTextProps, Text } from '@/components/ui/text';

export type DateTextProps = Omit<AppTextProps, 'children'> & {
  date?: Date | string | number | null;
  emptyValue?: string;
  format?: DateFormat;
};

/**
 * Mobile's `DateDisplay`: recent timestamps read as `Today at 14:05`, `Yesterday at 14:05`, or
 * `3 days ago`, and a tap swaps in the exact time that web shows as a tooltip.
 */
export function DateText({ date, emptyValue, format = 'short', ...props }: DateTextProps) {
  const [showExact, setShowExact] = useState(false);
  const { label, tooltip } = getDateDisplayParts({ date, emptyValue, format });

  if (!tooltip) {
    return <Text {...props}>{label}</Text>;
  }

  return (
    <Text accessibilityHint={tooltip} onPress={() => setShowExact((current) => !current)} {...props}>
      {showExact ? tooltip : label}
    </Text>
  );
}
