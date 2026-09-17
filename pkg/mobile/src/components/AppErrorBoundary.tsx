import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { captureException } from '@/lib/observability';
import { Text } from './ui/text';

export function AppErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    captureException(error, { source: 'render' });
  }, [error]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-4 px-7 py-10">
        <View className="h-16 w-16 items-center justify-center rounded-2xl border border-danger/25 bg-danger/10">
          <Text className="text-3xl text-danger" weight="bold">
            !
          </Text>
        </View>
        <Text className="text-center text-2xl text-foreground" weight="bold">
          Something went wrong
        </Text>
        <Text className="max-w-[420px] text-center text-sm text-muted-foreground">
          The problem has been recorded. Reload this screen to keep working.
        </Text>
        <Pressable
          accessibilityRole="button"
          className="min-h-[48px] min-w-[160px] items-center justify-center rounded-xl bg-primary px-5 py-3"
          onPress={retry}
        >
          <Text className="text-base text-primary-foreground" weight="bold">
            Reload
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
