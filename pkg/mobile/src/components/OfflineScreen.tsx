import { IconWifiOff } from '@tabler/icons-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { offlineMessage, offlineTitle, refreshConnectivity, useIsOffline } from '@/lib/connectivity';

/**
 * The app's offline gate. Mounted once over the navigator in `app/_layout.tsx`: it renders
 * nothing while online, and a blocking, opaque cover while offline — so no screen has to
 * know about connectivity. React Query refetches on reconnect (`refetchOnReconnect`), and
 * the cover simply lifts to reveal the user's exact place with fresh data.
 */
export function OfflineScreen() {
  const isOffline = useIsOffline();

  if (!isOffline) {
    return null;
  }

  return (
    <View
      accessibilityViewIsModal
      className="bg-background"
      style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100 }]}
    >
      <SafeAreaView className="flex-1 items-center justify-center gap-5 px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full border border-danger/25 bg-danger/10">
          <Icon className="text-danger" icon={IconWifiOff} size={30} />
        </View>
        <View className="gap-1.5">
          <Text className="text-center text-lg text-foreground" weight="bold">
            {offlineTitle}
          </Text>
          <Text className="text-center text-sm text-muted-foreground">{offlineMessage}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          className="rounded-xl border border-border bg-surface px-5 py-2.5 active:bg-muted"
          onPress={() => void refreshConnectivity()}
        >
          <Text className="text-sm text-foreground" weight="semibold">
            Try again
          </Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
