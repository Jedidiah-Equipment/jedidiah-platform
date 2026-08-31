import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MainTabToolbar } from '@/components/TopToolbar';
import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { Text } from '@/components/ui/text';
import type { MainTabParent } from '@/lib/toolbar-navigation';

export function TabAccessLoadingScreen({ parent, title }: { parent: MainTabParent; title: string }) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainTabToolbar assistantParent={parent} subtitle="CHECKING ACCESS" title={title} />
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Checking access" size="large" />
      </View>
    </SafeAreaView>
  );
}

export function TabAccessErrorScreen({
  onRetry,
  parent,
  title,
}: {
  onRetry: () => void;
  parent: MainTabParent;
  title: string;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainTabToolbar assistantParent={parent} subtitle="ACCESS UNAVAILABLE" title={title} />
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-center text-sm text-muted-foreground">
          Couldn’t check your mobile access. Check your connection and try again.
        </Text>
        <Pressable
          accessibilityRole="button"
          className="rounded-xl border border-border bg-surface px-4 py-2 active:bg-muted"
          onPress={onRetry}
        >
          <Text className="text-sm text-foreground" weight="semibold">
            Retry
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
