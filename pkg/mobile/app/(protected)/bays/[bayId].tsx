import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';

/**
 * Placeholder Bay schedule route so Bay List cards have a working tap target.
 * The real ACTIVE NOW + UP NEXT schedule lands in #519, which replaces this file.
 */
export default function BayScheduleRoute() {
  const router = useRouter();
  const { bayId } = useLocalSearchParams<{ bayId: string }>();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 gap-4 px-4 py-4">
        <Pressable accessibilityRole="button" className="self-start" onPress={() => router.back()}>
          <Text className="text-sm text-primary" weight="semibold">
            ‹ Back
          </Text>
        </Pressable>
        <Text className="text-2xl text-foreground" weight="bold">
          Bay schedule
        </Text>
        <Text className="text-sm text-muted-foreground">Coming in #519 · bay {bayId}</Text>
      </View>
    </SafeAreaView>
  );
}
