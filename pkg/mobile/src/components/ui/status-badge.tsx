import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTextClassNameForScheme } from '@/theme/use-scheme-class-name';

export type StatusBadgeClassNames = {
  chip: string;
  text: string;
};

const BADGE_SIZE = {
  compact: { chip: 'px-2 py-0.5', text: 'text-[9px]' },
  standard: { chip: 'px-2 py-1', text: 'text-[10px]' },
} as const;

/** Shared visual treatment for non-interactive status and type badges. */
export function StatusBadge({
  classNames,
  label,
  numberOfLines,
  size = 'standard',
}: {
  classNames: StatusBadgeClassNames;
  label: string;
  numberOfLines?: number;
  size?: keyof typeof BADGE_SIZE;
}) {
  const badgeSize = BADGE_SIZE[size];
  const textForScheme = useTextClassNameForScheme();

  return (
    <View className={`flex-row items-center rounded-full border ${badgeSize.chip} ${classNames.chip}`}>
      <Text
        className={`${badgeSize.text} tracking-wide ${textForScheme(classNames.text)}`}
        mono
        numberOfLines={numberOfLines}
        weight="semibold"
      >
        {label}
      </Text>
    </View>
  );
}
