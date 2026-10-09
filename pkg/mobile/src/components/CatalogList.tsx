import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';

const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
// The fixed frame prevents the loading list from shifting vertically when the real rows mount.
const CATALOG_CARD_FRAME_CLASS_NAME =
  'h-[76px] w-full flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3';

export function CatalogListCard({
  accessibilityHint,
  accessibilityLabel,
  avatarClassName = '',
  avatarFallback,
  avatarName,
  avatarUri,
  mainText,
  metadata,
  monoText,
  onPress,
  subText,
  trailing,
}: {
  accessibilityHint: string;
  accessibilityLabel: string;
  /** Tile styling that rides with `avatarFallback`, e.g. an offering kind's tint. */
  avatarClassName?: string;
  avatarFallback?: ReactNode;
  /** Names the tile; omit it for a list whose rows have nothing worth a tile, and the card starts with its text. */
  avatarName?: string;
  avatarUri?: string | null;
  mainText: string;
  metadata?: ReactNode;
  monoText?: string;
  onPress: () => void;
  subText: string;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={`${CATALOG_CARD_FRAME_CLASS_NAME} active:opacity-80`}
      onPress={onPress}
    >
      {avatarName === undefined ? null : (
        <Avatar
          className={`h-11 w-11 shrink-0 rounded-lg ${avatarClassName}`}
          fallback={avatarFallback}
          name={avatarName}
          textClassName="text-[10px]"
          uri={avatarUri}
        />
      )}
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] leading-5 text-foreground" numberOfLines={1} weight="semibold">
          {mainText}
        </Text>
        <Text className="mt-0.5 text-[11px] text-muted-foreground" numberOfLines={1}>
          {subText}
        </Text>
        {metadata !== undefined ? (
          <View className="mt-0.5 min-w-0 flex-row items-center gap-1">{metadata}</View>
        ) : monoText === undefined ? null : (
          <Text className="mt-0.5 text-[10px] text-muted-foreground" mono numberOfLines={1}>
            {monoText}
          </Text>
        )}
      </View>
      {trailing === undefined ? null : <View className="shrink-0 items-end justify-center">{trailing}</View>}
    </Pressable>
  );
}

export function CatalogListSkeleton({ trailing = true }: { trailing?: boolean }) {
  return (
    <View className="gap-3.5">
      {SKELETON_KEYS.map((key) => (
        <View className={CATALOG_CARD_FRAME_CLASS_NAME} key={key}>
          <Pulse className="h-11 w-11 rounded-lg" />
          <View className="min-w-0 flex-1 gap-1.5">
            <Pulse className="h-4 w-28 rounded" />
            <Pulse className="h-[10px] w-3/4 rounded" />
            <Pulse className="h-[10px] w-1/2 rounded" />
          </View>
          {trailing ? <Pulse className="h-8 w-20 rounded-lg" /> : null}
        </View>
      ))}
    </View>
  );
}
