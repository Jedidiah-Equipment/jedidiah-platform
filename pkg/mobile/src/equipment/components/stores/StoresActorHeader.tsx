import { IconUserX } from '@tabler/icons-react-native';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useStoresActor } from '@/equipment/lib/stores-actor';

/**
 * Who the tablet thinks is standing at it, in the largest type on the screen (spec §11).
 *
 * The size is the feature, not decoration: it has to be readable from arm's length across a
 * warehouse bench, because the failure this guards against is somebody posting under the last
 * person's name without noticing. Tapping it switches; the cross clears it deliberately.
 */
export function StoresActorHeader({ onSwitch }: { onSwitch: () => void }) {
  const { actor, clearActor } = useStoresActor();

  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <Pressable
        accessibilityHint="Choose who is at the tablet"
        accessibilityLabel={
          actor === null ? 'Nobody selected. Choose a name.' : `Signed in at the tablet: ${actor.name}`
        }
        accessibilityRole="button"
        className="min-w-0 flex-1 flex-row items-center gap-3"
        onPress={onSwitch}
      >
        {actor === null ? (
          <Icon className="text-danger" icon={IconUserX} size={28} />
        ) : (
          // The same face the quick-switch grid was tapped on, so the tablet confirms the choice
          // in the picture the person recognises rather than in a name they have to read.
          <Avatar
            className="h-12 w-12 shrink-0 rounded-full"
            name={actor.name}
            textClassName="text-sm"
            uri={actor.thumbnailDataUrl}
          />
        )}
        <View className="min-w-0 flex-1">
          <Text className="text-[11px] text-muted-foreground" mono numberOfLines={1}>
            {actor === null ? 'NOBODY AT THE TABLET' : 'WORKING AS'}
          </Text>
          <Text
            className={`text-3xl leading-9 ${actor === null ? 'text-muted-foreground' : 'text-foreground'}`}
            numberOfLines={1}
            weight="bold"
          >
            {actor?.name ?? 'Tap to choose a name'}
          </Text>
        </View>
      </Pressable>
      {actor === null ? null : (
        <Pressable
          accessibilityLabel="Clear the current person"
          accessibilityRole="button"
          className="shrink-0 rounded-xl border border-border px-3 py-2"
          onPress={clearActor}
        >
          <Text className="text-sm text-muted-foreground" weight="semibold">
            Done
          </Text>
        </Pressable>
      )}
    </View>
  );
}
