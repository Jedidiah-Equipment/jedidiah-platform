import { IconRefresh, IconWifiOff } from '@tabler/icons-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { offlineMessage, offlineTitle, useConnectivity } from '@/lib/connectivity';

export function OfflineBanner() {
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();

  if (!isOffline) {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      className="absolute left-4 right-4 z-50 flex-row items-center gap-2 rounded-xl border border-danger/25 bg-surface px-3 py-2 shadow-lg"
      pointerEvents="none"
      style={{ bottom: insets.bottom + 12, elevation: 8, zIndex: 50 }}
    >
      <Icon className="text-danger" icon={IconWifiOff} size={18} />
      <View className="min-w-0 flex-1">
        <Text className="text-xs text-danger" weight="semibold">
          {offlineTitle}
        </Text>
        <Text className="mt-0.5 text-[11px] text-muted-foreground">{offlineMessage}</Text>
      </View>
    </View>
  );
}

export function OfflineState({
  title = offlineTitle,
  message = offlineMessage,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View className="items-center justify-center rounded-2xl border border-dashed border-border px-4 py-8">
      <View className="mb-3 h-10 w-10 items-center justify-center rounded-full border border-danger/25 bg-danger/10">
        <Icon className="text-danger" icon={IconWifiOff} size={20} />
      </View>
      <Text className="text-center text-sm text-foreground" weight="semibold">
        {title}
      </Text>
      <Text className="mt-1 text-center text-sm text-muted-foreground">{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          className="mt-4 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 active:bg-muted"
          onPress={onRetry}
        >
          <Icon className="text-foreground" icon={IconRefresh} size={16} />
          <Text className="text-sm text-foreground" weight="semibold">
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function RetryLoadState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <View className="rounded-2xl border border-border bg-surface px-4 py-5">
      <Text className="text-sm text-danger" weight="semibold">
        {title}
      </Text>
      <Text className="mt-1 text-sm text-muted-foreground">{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          className="mt-4 flex-row items-center gap-2 self-start rounded-xl border border-border bg-background px-4 py-2 active:bg-muted"
          onPress={onRetry}
        >
          <Icon className="text-foreground" icon={IconRefresh} size={16} />
          <Text className="text-sm text-foreground" weight="semibold">
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
