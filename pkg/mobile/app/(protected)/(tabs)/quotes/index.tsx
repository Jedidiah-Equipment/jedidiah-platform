import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/ui/text';

/** Quote list placeholder. The Quotes layout owns the permission gate. */
export default function QuotesRoute() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-[1180px] gap-5 px-4 pb-8 pt-4">
        <ScreenHeader subtitle="Sales quotes" title="Quotes" />
        <View className="rounded-2xl border border-dashed border-border px-4 py-10">
          <Text className="text-center text-sm text-foreground" weight="semibold">
            Quote list coming soon
          </Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">
            Quotes will appear here in the next part of the mobile Quotes rollout.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
