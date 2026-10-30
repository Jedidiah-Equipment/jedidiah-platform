import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';

const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
// The fixed height prevents the loading list from shifting vertically when the real rows mount.
const CARD_CLASS_NAME = 'h-[76px] w-full flex-row items-center rounded-2xl border bg-surface';
/** The avatar tile's side in points, for a `leading` control that should match it (`h-11 w-11` below). */
export const CATALOG_AVATAR_TILE = 44;

export function CatalogListCard({
  accessibilityHint,
  action,
  accessibilityLabel,
  avatarClassName = '',
  avatarFallback,
  avatarName,
  avatarUri,
  borderClassName = 'border-border',
  leading,
  mainText,
  metadata,
  monoText,
  onPress,
  subText,
  trailing,
}: {
  accessibilityHint: string;
  accessibilityLabel: string;
  /** A control that ends the row, after the tappable body, as `leading` starts it. */
  action?: ReactNode;
  /** Tile styling that rides with `avatarFallback`, e.g. an offering kind's tint. */
  avatarClassName?: string;
  avatarFallback?: ReactNode;
  /** Names the tile; omit it for a list whose rows have nothing worth a tile, and the card starts with its text. */
  avatarName?: string;
  avatarUri?: string | null;
  /** The card's border colour when something on the row needs to show through it. */
  borderClassName?: string;
  /** A control that leads the row, ahead of the avatar. It sits beside the tappable body: a button cannot hold a button. */
  leading?: ReactNode;
  mainText: string;
  metadata?: ReactNode;
  monoText?: string;
  onPress: () => void;
  subText: string;
  /** Fills the card's height, centred; a caller that wants its own vertical layout makes this a `flex-1` column. */
  trailing?: ReactNode;
}) {
  return (
    <View className={`${CARD_CLASS_NAME} ${borderClassName}`}>
      {leading === undefined ? null : <View className="pl-3">{leading}</View>}
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className="min-w-0 flex-1 flex-row items-center gap-3 self-stretch p-3 active:opacity-80"
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
        {trailing === undefined ? null : (
          <View className="shrink-0 items-end justify-center self-stretch">{trailing}</View>
        )}
      </Pressable>
      {action === undefined ? null : <View className="pr-3">{action}</View>}
    </View>
  );
}

export function CatalogListSkeleton({ trailing = true }: { trailing?: boolean }) {
  return (
    <View className="gap-3.5">
      {SKELETON_KEYS.map((key) => (
        <View className={`${CARD_CLASS_NAME} gap-3 border-border p-3`} key={key}>
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
